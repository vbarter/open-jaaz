from fastapi import APIRouter, HTTPException, Request, Depends, Header
from typing import Optional, List
from pydantic import BaseModel
import os

from services.db_service import db_service
from services.payment_service import payment_service
from routers.auth_router import verify_access_token
from log import get_logger

logger = get_logger(__name__)

router = APIRouter()

# Get payment provider from environment
PAYMENT_PROVIDER = os.getenv("PAYMENT_PROVIDER", "creem").lower()

# Import Stripe service if configured
stripe_service = None
if PAYMENT_PROVIDER == "stripe":
    from services.stripe_payment_service import stripe_payment_service
    stripe_service = stripe_payment_service
    logger.info("Using Stripe as payment provider")
else:
    logger.info("Using Creem as payment provider")

def get_payment_service():
    """Get the configured payment service"""
    if PAYMENT_PROVIDER == "stripe":
        return stripe_service
    return payment_service

class BalanceResponse(BaseModel):
    balance: str

class CreateOrderRequest(BaseModel):
    plan_type: str  # base, pro, max
    billing_period: str  # monthly, yearly

class CreateOrderResponse(BaseModel):
    success: bool
    checkout_url: Optional[str] = None
    order_id: Optional[int] = None
    message: Optional[str] = None

class Product(BaseModel):
    id: int
    product_id: str
    name: str
    level: str
    points: int
    price_cents: int
    description: str

class ProductListResponse(BaseModel):
    products: List[Product]

class CancelSubscriptionResponse(BaseModel):
    success: bool
    message: Optional[str] = None
    subscription_id: Optional[str] = None

def get_current_user(request: Request) -> Optional[dict]:
    """从请求头或Cookie中获取当前用户信息"""
    # 🔧 首先尝试Bearer token认证
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]  # Remove "Bearer " prefix
        user_payload = verify_access_token(token)
        if user_payload:
            return user_payload
    
    # 🔧 然后尝试Cookie认证
    auth_token = request.cookies.get("auth_token")
    if auth_token:
        user_payload = verify_access_token(auth_token)
        if user_payload:
            return user_payload
    
    return None

@router.get("/api/billing/getBalance", response_model=BalanceResponse)
async def get_balance(request: Request):
    """获取用户积分余额"""
    # 验证用户认证
    user_payload = get_current_user(request)
    if not user_payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = user_payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user_id")
    
    try:
        # 从数据库获取用户信息
        user = await db_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # 将积分转换为金额格式（积分除以100）
        points = user.get("points", 0)
        balance_amount = points / 100.0
        
        logger.info(f"User {user_id} balance request: {points} points = ${balance_amount:.2f}")
        
        return BalanceResponse(balance=f"{balance_amount:.2f}")
        
    except Exception as e:
        logger.error(f"Error getting balance for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/api/billing/products", response_model=ProductListResponse)
async def get_products():
    """获取所有可用的产品列表"""
    try:
        products = await db_service.list_products()
        return ProductListResponse(products=products)
    except Exception as e:
        logger.error(f"Error getting products: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/api/billing/create_order", response_model=CreateOrderResponse)
async def create_order(request: Request, order_data: CreateOrderRequest):
    """创建支付订单"""
    # 验证用户认证
    user_payload = get_current_user(request)
    if not user_payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = user_payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user_id")
    
    try:
        # 获取用户信息
        user = await db_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        user_uuid = user.get("uuid")
        user_email = user.get("email")
        
        # 🎯 根据plan_type和billing_period构建level，从数据库查询产品
        level = f"{order_data.plan_type}_{order_data.billing_period}"
        
        logger.info(f"🎯 BILLING: 查询产品level: {level}")
        
        # 从数据库获取产品信息
        product = await db_service.get_product_by_level(level)
        if not product:
            raise HTTPException(status_code=400, detail=f"Product not found for plan: {order_data.plan_type} {order_data.billing_period}")
        
        # 根据payment provider获取正确的产品ID
        if PAYMENT_PROVIDER == "stripe":
            # Stripe使用stripe_price_id
            provider_product_id = product.get('stripe_price_id')
            if not provider_product_id:
                raise HTTPException(status_code=400, detail=f"Stripe price ID not found for level: {level}")
            logger.info(f"✅ BILLING: 找到产品: {product['name']} (level: {product['level']}, stripe_price_id: {provider_product_id})")
        else:
            # Creem使用sku
            provider_product_id = product.get('sku')
            if not provider_product_id:
                raise HTTPException(status_code=400, detail=f"Product SKU not found for level: {level}")
            logger.info(f"✅ BILLING: 找到产品: {product['name']} (level: {product['level']}, sku: {provider_product_id})")

        # 创建本地订单记录（使用数据库中的product_id，不是sku或stripe_price_id）
        order_id = await db_service.create_order(
            user_uuid=user_uuid,
            product_id=product['product_id'],
            price_cents=product['price_cents'],
            payment_provider=PAYMENT_PROVIDER  # 记录使用的支付提供商
        )

        if not order_id:
            raise HTTPException(status_code=500, detail="Failed to create order")

        # 获取配置的支付服务
        active_payment_service = get_payment_service()

        # 调用支付API创建支付链接
        if PAYMENT_PROVIDER == "stripe":
            payment_result = await active_payment_service.create_checkout(
                product_id=provider_product_id,
                customer_email=user_email,
                user_uuid=user_uuid
            )
        else:
            # Creem
            payment_result = await active_payment_service.create_checkout(
                product_id=provider_product_id,
                customer_email=user_email
            )
        
        if not payment_result.get("success"):
            logger.error(f"Payment checkout creation failed: {payment_result}")
            return CreateOrderResponse(
                success=False,
                message=f"Payment service error: {payment_result.get('error', 'Unknown error')}"
            )

        # 更新订单记录，保存支付相关信息
        payment_data = payment_result.get("data", {})
        checkout_id = payment_data.get("id")

        # 🔍 调试：查看支付API返回的完整数据
        logger.info(f"🔍 Payment API 返回数据: {payment_data}")

        # 尝试从不同可能的字段名中获取 checkout URL
        checkout_url = (
            payment_data.get("url") or
            payment_data.get("checkout_url") or
            payment_data.get("payment_url") or
            payment_data.get("link")
        )

        # 如果还是没有 URL，根据provider构建
        if not checkout_url and checkout_id:
            if PAYMENT_PROVIDER == "stripe":
                # Stripe会话ID不能直接构建URL，需要从返回数据中获取
                checkout_url = payment_data.get("url")
            else:
                # Creem可以构建URL
                checkout_url = f"https://checkout.creem.io/{checkout_id}"
            logger.info(f"🔧 构建的支付链接: {checkout_url}")
        
        logger.info(f"✅ 最终的 checkout_url: {checkout_url}")
        
        # 🚨 确保有有效的 checkout_url
        if not checkout_url:
            logger.error(f"❌ 无法获取有效的支付链接，checkout_id: {checkout_id}")
            return CreateOrderResponse(
                success=False,
                message="Failed to generate payment link"
            )
        
        if checkout_id:
            if PAYMENT_PROVIDER == "stripe":
                # 更新Stripe相关信息
                await db_service.update_order_stripe_info(
                    order_id=order_id,
                    stripe_session_id=checkout_id
                )
            else:
                # 更新Creem相关信息
                await db_service.update_order_creem_info(
                    order_id=order_id,
                    creem_checkout_id=checkout_id
                )
        
        logger.info(f"Order created successfully: {order_id}, checkout_id: {checkout_id}")
        
        return CreateOrderResponse(
            success=True,
            checkout_url=checkout_url,
            order_id=order_id,
            message="Payment link created successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating order for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/payments")
async def handle_payment_callback(request: Request):
    """处理Creem支付成功回调"""
    try:
        # 获取查询参数
        query_params = dict(request.query_params)
        logger.info(f"🚀🚀🚀 CALLBACK HANDLER STARTED WITH FIXED CODE! 🚀🚀🚀")
        logger.info(f"Received payment callback: {query_params}")
        
        # 解析回调参数
        callback_data = payment_service.parse_callback_params(query_params)
        if not callback_data:
            logger.error("❌ CALLBACK: Invalid callback parameters")
            raise HTTPException(status_code=400, detail="Invalid callback parameters")
        
        logger.info(f"✅ CALLBACK: 解析成功，callback_data: {callback_data}")
        
        # 验证回调签名（简化版本）
        if not payment_service.verify_callback_signature(query_params):
            logger.error("Invalid callback signature")
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        # 获取相关信息
        creem_order_id = callback_data['order_id']
        product_id = callback_data['product_id']
        checkout_id = callback_data['checkout_id']
        subscription_id = callback_data.get('subscription_id')
        
        # 查找本地订单 - 优先使用order_id，如果没有则使用checkout_id
        order = None
        if creem_order_id:
            order = await db_service.get_order_by_creem_order_id(creem_order_id)
        
        if not order and checkout_id:
            order = await db_service.get_order_by_checkout_id(checkout_id)
            logger.info(f"Found order by checkout_id: {checkout_id}")
        
        if not order:
            logger.error(f"❌ CALLBACK: Order not found for Creem order ID: {creem_order_id} or checkout ID: {checkout_id}")
            raise HTTPException(status_code=404, detail="Order not found")
        
        # 检查订单是否已经处理过
        if order['status'] == 'completed':
            logger.info(f"Order {order['id']} already completed")
            return {"status": "success", "message": "Order already processed"}
        
        # 更新订单的Creem信息
        await db_service.update_order_creem_info(
            order_id=order['id'],
            creem_order_id=creem_order_id,
            creem_checkout_id=checkout_id,
            creem_subscription_id=subscription_id
        )
        
        # 获取产品信息（积分数量）
        # 🔧 由于Creem回调中的product_id实际上是sku，需要先根据sku查找，如果找不到再按product_id查找
        logger.info(f"🔍 CALLBACK: 开始查找产品，回调product_id: {product_id}")
        
        product = await db_service.get_product_by_sku(product_id)
        logger.info(f"🔍 CALLBACK: 根据sku查找结果: {product}")
        
        if not product:
            # 回退到按product_id查找（兼容旧数据）
            logger.info(f"🔄 CALLBACK: sku查找失败，尝试按product_id查找...")
            product = await db_service.get_product_by_id(product_id)
            logger.info(f"🔍 CALLBACK: 根据product_id查找结果: {product}")
        
        if not product:
            logger.error(f"❌ CALLBACK: 产品查找失败，product_id: {product_id}")
            raise HTTPException(status_code=400, detail="Product not found")
        
        logger.info(f"✅ CALLBACK: 找到产品: {product['name']} (level: {product['level']}, sku: {product.get('sku', 'N/A')})")
        
        points_to_add = product['points']
        user_uuid = order['user_uuid']
        
        # 为用户增加积分
        success = await db_service.add_user_points(user_uuid, points_to_add)
        if not success:
            logger.error(f"Failed to add points to user {user_uuid}")
            raise HTTPException(status_code=500, detail="Failed to update user points")
        
        # 更新用户等级
        user = await db_service.get_user_by_uuid(user_uuid)
        if user and user['level'] != product['level']:
            await db_service.update_user_level(user['id'], product['level'])
            logger.info(f"Updated user {user_uuid} level to {product['level']}")
        
        # 🆕 更新用户订阅信息：存储subscription_id和order_id
        creem_subscription_id = callback_data.get('subscription_id')
        creem_order_id = callback_data.get('order_id')
        
        if creem_subscription_id or creem_order_id:
            logger.info(f"🎯 CALLBACK: 更新用户订阅信息 - subscription_id: {creem_subscription_id}, order_id: {creem_order_id}")
            
            subscription_update_success = await db_service.update_user_subscription(
                user_uuid=user_uuid,
                subscription_id=creem_subscription_id,
                order_id=creem_order_id
            )
            
            if subscription_update_success:
                logger.info(f"✅ CALLBACK: 订阅信息更新成功 - User: {user_uuid}")
            else:
                logger.error(f"❌ CALLBACK: 订阅信息更新失败 - User: {user_uuid}")
        else:
            logger.warning(f"⚠️ CALLBACK: 回调中缺少subscription_id或order_id，跳过订阅信息更新")
        
        # 完成订单
        await db_service.complete_order(order['id'], points_to_add)
        
        logger.info(f"Payment processed successfully: order {order['id']}, user {user_uuid}, points {points_to_add}")
        
        # 支付成功后重定向回前端页面
        from fastapi.responses import RedirectResponse
        from routers.auth_router import get_redirect_uri
        
        # 动态获取正确的前端URI
        frontend_uri = get_redirect_uri(request)
        
        # 构建成功页面URL，包含支付结果信息
        success_url = f"{frontend_uri}/?payment=success&points={points_to_add}&level={product['level']}&order_id={order['id']}"
        
        logger.info(f"Redirecting to success page: {success_url}")
        
        # 创建重定向响应，确保保持认证状态
        response = RedirectResponse(url=success_url, status_code=302)
        
        # 🔧 重要：确保认证cookie在重定向时得到正确设置
        # 检测是否是跨端口重定向，如果是则需要特殊处理
        request_host = request.headers.get("host", "")
        redirect_host = frontend_uri.split("://")[1] if "://" in frontend_uri else frontend_uri
        
        if request_host != redirect_host:
            logger.info(f"Cross-port redirect detected: {request_host} -> {redirect_host}")
            
            # 获取现有的认证cookie
            auth_token = request.cookies.get("auth_token")
            user_uuid = request.cookies.get("user_uuid")
            user_email = request.cookies.get("user_email")
            
            if auth_token and user_uuid:
                # 重新设置cookie，确保在目标域名/端口生效
                is_secure = frontend_uri.startswith("https://")
                is_localhost = "localhost" in frontend_uri or "127.0.0.1" in frontend_uri
                
                cookie_kwargs = {
                    "max_age": 30 * 24 * 60 * 60,  # 30天
                    "secure": is_secure and not is_localhost,
                    "samesite": "lax",
                    "path": "/"
                }
                
                # 在localhost环境下，不设置domain让cookie对所有端口生效
                if not is_localhost:
                    import urllib.parse as urlparse
                    cookie_kwargs["domain"] = urlparse.urlparse(frontend_uri).hostname
                
                response.set_cookie("auth_token", auth_token, **cookie_kwargs)
                response.set_cookie("user_uuid", user_uuid, **cookie_kwargs)
                if user_email:
                    response.set_cookie("user_email", user_email, **cookie_kwargs)
                
                logger.info("✅ Auth cookies re-set for cross-port redirect")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing payment callback: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/api/stripe/webhook")
async def handle_stripe_webhook(request: Request):
    """处理Stripe webhook事件"""
    if PAYMENT_PROVIDER != "stripe":
        raise HTTPException(status_code=404, detail="Stripe webhooks not enabled")

    try:
        # 获取请求体和签名
        payload = await request.body()
        signature = request.headers.get("Stripe-Signature")

        if not signature:
            logger.error("Missing Stripe-Signature header")
            raise HTTPException(status_code=400, detail="Missing signature")

        # 解析webhook事件
        event_data = stripe_service.parse_webhook_event(payload, signature)

        if not event_data:
            logger.error("Failed to parse Stripe webhook")
            raise HTTPException(status_code=400, detail="Invalid webhook")

        event_type = event_data.get("type")
        logger.info(f"Processing Stripe webhook: {event_type}")

        # 处理不同的事件类型
        if event_type == "checkout.completed":
            # 支付成功
            session_id = event_data.get("session_id")
            subscription_id = event_data.get("subscription_id")
            customer_id = event_data.get("customer_id")
            user_uuid = event_data.get("metadata", {}).get("user_uuid")

            # 查找本地订单
            order = await db_service.get_order_by_stripe_session_id(session_id)

            if not order:
                logger.error(f"Order not found for Stripe session: {session_id}")
                raise HTTPException(status_code=404, detail="Order not found")

            # 检查订单是否已经处理过
            if order['status'] == 'completed':
                logger.info(f"Order {order['id']} already completed")
                return {"status": "success", "message": "Order already processed"}

            # 更新订单的Stripe信息
            await db_service.update_order_stripe_info(
                order_id=order['id'],
                stripe_subscription_id=subscription_id,
                stripe_customer_id=customer_id
            )

            # 获取产品信息
            product = await db_service.get_product_by_id(order['product_id'])

            if not product:
                logger.error(f"Product not found: {order['product_id']}")
                raise HTTPException(status_code=400, detail="Product not found")

            points_to_add = product['points']
            user_uuid = order['user_uuid']

            # 为用户增加积分
            success = await db_service.add_user_points(user_uuid, points_to_add)
            if not success:
                logger.error(f"Failed to add points to user {user_uuid}")
                raise HTTPException(status_code=500, detail="Failed to update user points")

            # 更新用户等级
            user = await db_service.get_user_by_uuid(user_uuid)
            if user and user['level'] != product['level']:
                await db_service.update_user_level(user['id'], product['level'])
                logger.info(f"Updated user {user_uuid} level to {product['level']}")

            # 更新用户订阅信息
            if subscription_id:
                await db_service.update_user_subscription(
                    user_uuid=user_uuid,
                    subscription_id=subscription_id,
                    order_id=order['id']
                )

            # 完成订单
            await db_service.complete_order(order['id'], points_to_add)

            logger.info(f"Stripe payment processed: order {order['id']}, user {user_uuid}, points {points_to_add}")

        elif event_type == "subscription.deleted":
            # 订阅取消
            subscription_id = event_data.get("subscription_id")
            user_uuid = event_data.get("metadata", {}).get("user_uuid")

            if user_uuid:
                # 清空订阅信息
                await db_service.clear_user_subscription(user_uuid)

                # 更新用户等级为free
                user = await db_service.get_user_by_uuid(user_uuid)
                if user:
                    await db_service.update_user_level(user['id'], 'free')
                    logger.info(f"Stripe subscription cancelled for user {user_uuid}")

        elif event_type == "subscription.updated":
            # 订阅更新
            subscription_id = event_data.get("subscription_id")
            status = event_data.get("status")
            logger.info(f"Stripe subscription {subscription_id} updated to status: {status}")

        return {"status": "success"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing Stripe webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/api/billing/cancel_subscription", response_model=CancelSubscriptionResponse)
async def cancel_subscription(request: Request):
    """取消用户订阅"""
    # 验证用户认证
    user_payload = get_current_user(request)
    if not user_payload:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_id = user_payload.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user_id")
    
    try:
        # 获取用户信息
        user = await db_service.get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # 检查用户是否有有效的订阅
        subscription_id = user.get("subscription_id")
        if not subscription_id:
            raise HTTPException(status_code=400, detail="No active subscription found")
        
        logger.info(f"Cancel subscription request for user {user_id}, subscription: {subscription_id}")

        # 获取订单信息以确定使用的支付提供商
        order_id = user.get("order_id")
        provider = PAYMENT_PROVIDER  # 默认使用当前配置的提供商

        if order_id:
            order = await db_service.get_order_by_id(order_id)
            if order and order.get("payment_provider"):
                provider = order["payment_provider"]

        # 根据提供商调用相应的取消订阅API
        if provider == "stripe":
            cancel_service = stripe_service if stripe_service else payment_service
        else:
            cancel_service = payment_service

        cancel_result = await cancel_service.cancel_subscription(subscription_id)
        
        if not cancel_result.get("success"):
            logger.error(f"Failed to cancel subscription {subscription_id}: {cancel_result}")
            return CancelSubscriptionResponse(
                success=False,
                message=f"Failed to cancel subscription: {cancel_result.get('error', 'Unknown error')}"
            )
        
        # 验证取消成功后，更新数据库
        # 清空subscription_id和order_id，设置level为free
        user_uuid = user.get("uuid")
        update_success = await db_service.clear_user_subscription(user_uuid)
        
        if update_success:
            # 更新用户等级为free
            level_update_success = await db_service.update_user_level(user_id, 'free')
            if level_update_success:
                logger.info(f"Successfully cancelled subscription and updated user {user_id} to free level")
                return CancelSubscriptionResponse(
                    success=True,
                    message="Subscription cancelled successfully",
                    subscription_id=subscription_id
                )
            else:
                logger.error(f"Failed to update user level to free for user {user_id}")
                return CancelSubscriptionResponse(
                    success=False,
                    message="Subscription cancelled but failed to update user level"
                )
        else:
            logger.error(f"Failed to update subscription info for user {user_id}")
            return CancelSubscriptionResponse(
                success=False,
                message="Subscription cancelled but failed to update user info"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling subscription for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")