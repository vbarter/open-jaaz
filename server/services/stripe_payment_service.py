import os
import stripe
import hashlib
import hmac
from typing import Dict, Any, Optional
from log import get_logger
from dotenv import load_dotenv
load_dotenv()

logger = get_logger(__name__)

class StripePaymentService:
    def __init__(self):
        # Stripe API配置
        self.stripe_secret_key = os.getenv("STRIPE_SECRET_KEY")
        self.stripe_publishable_key = os.getenv("STRIPE_PUBLISHABLE_KEY")
        self.webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
        self.success_url = os.getenv("STRIPE_SUCCESS_URL", "http://localhost:8000/payments")
        self.cancel_url = os.getenv("STRIPE_CANCEL_URL", "http://localhost:3000/pricing")

        # 初始化Stripe
        stripe.api_key = self.stripe_secret_key

        # 开发模式检查
        self.is_dev_mode = os.getenv("PAYMENT_DEV_MODE", "false").lower() == "true"

        if self.is_dev_mode:
            logger.info("Stripe Payment Service initialized in DEV MODE")
        else:
            logger.info("Stripe Payment Service initialized")

    async def create_checkout(self, product_id: str, customer_email: str = None, user_uuid: str = None) -> Dict[str, Any]:
        """
        创建Stripe支付会话

        Args:
            product_id: Stripe价格ID (price_xxx)
            customer_email: 客户邮箱（可选）
            user_uuid: 用户UUID（用于metadata）

        Returns:
            Dict包含checkout_url和session_id等信息
        """
        try:
            # 开发模式直接返回成功
            if self.is_dev_mode:
                logger.info(f"[DEV MODE] Creating mock Stripe checkout for product: {product_id}")
                return {
                    "success": True,
                    "data": {
                        "id": f"cs_test_dev_{user_uuid}",
                        "url": f"{self.success_url}?session_id=cs_test_dev_{user_uuid}&product_id={product_id}",
                        "payment_status": "paid"
                    }
                }

            # 构建Stripe会话参数
            session_params = {
                'payment_method_types': ['card'],
                'line_items': [{
                    'price': product_id,  # Stripe价格ID
                    'quantity': 1,
                }],
                'mode': 'subscription',
                'success_url': f"{self.success_url}?session_id={{CHECKOUT_SESSION_ID}}",
                'cancel_url': self.cancel_url,
            }

            # 添加客户邮箱
            if customer_email:
                session_params['customer_email'] = customer_email

            # 添加元数据
            if user_uuid:
                session_params['metadata'] = {
                    'user_uuid': user_uuid
                }

            # 添加订阅元数据
            session_params['subscription_data'] = {
                'metadata': {
                    'user_uuid': user_uuid
                }
            }

            logger.info(f"Creating Stripe checkout session for product: {product_id}")

            # 创建Stripe会话
            session = stripe.checkout.Session.create(**session_params)

            logger.info(f"Stripe checkout session created successfully: {session.id}")

            return {
                "success": True,
                "data": {
                    "id": session.id,
                    "url": session.url,
                    "payment_status": session.payment_status
                }
            }

        except stripe.error.StripeError as e:
            logger.error(f"Stripe API error: {e.user_message}")
            return {
                "success": False,
                "error": f"Stripe API error: {e.user_message}"
            }
        except Exception as e:
            logger.error(f"Error creating Stripe checkout: {e}")
            return {
                "success": False,
                "error": f"Payment service error: {str(e)}"
            }

    def verify_webhook_signature(self, payload: bytes, signature: str) -> bool:
        """
        验证Stripe webhook签名

        Args:
            payload: 原始请求体
            signature: Stripe-Signature header

        Returns:
            bool: 签名是否有效
        """
        try:
            # 开发模式跳过验证
            if self.is_dev_mode:
                logger.info("[DEV MODE] Skipping webhook signature verification")
                return True

            # 使用Stripe SDK验证签名
            stripe.Webhook.construct_event(
                payload, signature, self.webhook_secret
            )
            logger.info("Stripe webhook signature verified successfully")
            return True

        except stripe.error.SignatureVerificationError:
            logger.error("Invalid Stripe webhook signature")
            return False
        except Exception as e:
            logger.error(f"Error verifying webhook signature: {e}")
            return False

    def parse_webhook_event(self, payload: bytes, signature: str) -> Optional[Dict[str, Any]]:
        """
        解析Stripe webhook事件

        Args:
            payload: 原始请求体
            signature: Stripe-Signature header

        Returns:
            解析后的事件数据，如果解析失败返回None
        """
        try:
            # 开发模式返回模拟数据
            if self.is_dev_mode:
                import json
                event_data = json.loads(payload)
                logger.info(f"[DEV MODE] Parsed mock webhook event: {event_data.get('type', 'unknown')}")
                return event_data

            # 构造并验证事件
            event = stripe.Webhook.construct_event(
                payload, signature, self.webhook_secret
            )

            logger.info(f"Parsed Stripe webhook event: {event['type']}")

            # 处理不同类型的事件
            if event['type'] == 'checkout.session.completed':
                session = event['data']['object']
                return {
                    'type': 'checkout.completed',
                    'session_id': session['id'],
                    'customer_id': session.get('customer'),
                    'subscription_id': session.get('subscription'),
                    'payment_status': session['payment_status'],
                    'metadata': session.get('metadata', {}),
                    'customer_email': session.get('customer_details', {}).get('email')
                }

            elif event['type'] == 'customer.subscription.deleted':
                subscription = event['data']['object']
                return {
                    'type': 'subscription.deleted',
                    'subscription_id': subscription['id'],
                    'customer_id': subscription['customer'],
                    'status': subscription['status'],
                    'metadata': subscription.get('metadata', {})
                }

            elif event['type'] == 'customer.subscription.updated':
                subscription = event['data']['object']
                return {
                    'type': 'subscription.updated',
                    'subscription_id': subscription['id'],
                    'customer_id': subscription['customer'],
                    'status': subscription['status'],
                    'metadata': subscription.get('metadata', {})
                }

            else:
                logger.info(f"Unhandled webhook event type: {event['type']}")
                return {
                    'type': event['type'],
                    'data': event['data']['object']
                }

        except stripe.error.SignatureVerificationError:
            logger.error("Invalid Stripe webhook signature")
            return None
        except Exception as e:
            logger.error(f"Error parsing webhook event: {e}")
            return None

    def parse_callback_params(self, query_params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        解析Stripe回调参数（用于成功页面重定向）
        与Creem兼容的接口

        Args:
            query_params: URL查询参数

        Returns:
            解析后的回调数据，如果解析失败返回None
        """
        try:
            session_id = query_params.get('session_id')

            if not session_id:
                logger.error("Missing session_id in callback parameters")
                return None

            # 开发模式返回模拟数据
            if self.is_dev_mode:
                logger.info(f"[DEV MODE] Returning mock callback data for session: {session_id}")
                return {
                    'checkout_id': session_id,
                    'order_id': f"order_dev_{session_id}",
                    'customer_id': "cust_dev_test",
                    'subscription_id': f"sub_dev_{session_id}",
                    'product_id': query_params.get('product_id', 'price_dev_test'),
                    'signature': 'dev_mode_signature'
                }

            # 获取会话详情
            try:
                session = stripe.checkout.Session.retrieve(
                    session_id,
                    expand=['subscription', 'customer']
                )

                # 构造与Creem兼容的回调数据
                callback_data = {
                    'checkout_id': session.id,
                    'order_id': session.id,  # 使用session_id作为order_id
                    'customer_id': session.customer,
                    'subscription_id': session.subscription,
                    'product_id': None,  # 需要从line_items获取
                    'signature': 'stripe_verified'  # 标记为已验证
                }

                # 尝试获取产品ID
                if session.line_items:
                    line_items = stripe.checkout.Session.list_line_items(session_id, limit=1)
                    if line_items.data:
                        callback_data['product_id'] = line_items.data[0].price.id

                logger.info(f"Parsed Stripe callback for session: {session_id}")
                return callback_data

            except stripe.error.StripeError as e:
                logger.error(f"Error retrieving session from Stripe: {e}")
                return None

        except Exception as e:
            logger.error(f"Error parsing callback parameters: {e}")
            return None

    async def cancel_subscription(self, subscription_id: str) -> Dict[str, Any]:
        """
        取消Stripe订阅

        Args:
            subscription_id: Stripe订阅ID

        Returns:
            Dict包含取消结果信息
        """
        try:
            # 开发模式直接返回成功
            if self.is_dev_mode:
                logger.info(f"[DEV MODE] Cancelling mock subscription: {subscription_id}")
                return {
                    "success": True,
                    "data": {
                        "id": subscription_id,
                        "status": "canceled"
                    },
                    "subscription_id": subscription_id,
                    "status": "canceled"
                }

            logger.info(f"Cancelling Stripe subscription: {subscription_id}")

            # 取消订阅
            subscription = stripe.Subscription.cancel(subscription_id)

            # 验证状态
            if subscription.status not in ['canceled', 'cancelled']:
                logger.error(f"Subscription cancellation may have failed: status is {subscription.status}")
                return {
                    "success": False,
                    "error": f"Cancellation uncertain: status is {subscription.status}"
                }

            logger.info(f"Subscription {subscription_id} cancelled successfully")

            return {
                "success": True,
                "data": {
                    "id": subscription.id,
                    "status": subscription.status,
                    "canceled_at": subscription.canceled_at,
                    "current_period_end": subscription.current_period_end
                },
                "subscription_id": subscription.id,
                "status": subscription.status
            }

        except stripe.error.InvalidRequestError as e:
            # 检查是否已经取消
            if "No such subscription" in str(e) or "already been canceled" in str(e):
                logger.info(f"Subscription {subscription_id} was already cancelled or doesn't exist")
                return {
                    "success": True,
                    "data": {"id": subscription_id, "status": "canceled"},
                    "subscription_id": subscription_id,
                    "status": "canceled",
                    "message": "Subscription was already cancelled or doesn't exist"
                }

            logger.error(f"Stripe API error: {e}")
            return {
                "success": False,
                "error": f"Stripe API error: {e.user_message}"
            }

        except stripe.error.StripeError as e:
            logger.error(f"Stripe API error: {e}")
            return {
                "success": False,
                "error": f"Stripe API error: {e.user_message}"
            }

        except Exception as e:
            logger.error(f"Error cancelling Stripe subscription: {e}")
            return {
                "success": False,
                "error": f"Payment service error: {str(e)}"
            }

    async def get_subscription_status(self, subscription_id: str) -> Dict[str, Any]:
        """
        获取订阅状态

        Args:
            subscription_id: Stripe订阅ID

        Returns:
            订阅状态信息
        """
        try:
            if self.is_dev_mode:
                return {
                    "success": True,
                    "data": {
                        "id": subscription_id,
                        "status": "active",
                        "current_period_end": None
                    }
                }

            subscription = stripe.Subscription.retrieve(subscription_id)

            return {
                "success": True,
                "data": {
                    "id": subscription.id,
                    "status": subscription.status,
                    "current_period_end": subscription.current_period_end,
                    "cancel_at_period_end": subscription.cancel_at_period_end
                }
            }

        except stripe.error.StripeError as e:
            logger.error(f"Error retrieving subscription: {e}")
            return {
                "success": False,
                "error": str(e)
            }

# 创建单例实例
stripe_payment_service = StripePaymentService()