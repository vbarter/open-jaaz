import os
from fastapi import APIRouter, Depends, Request
import requests
import httpx
from log import get_logger
from utils.auth_utils import get_current_user_optional, get_user_uuid_for_database_operations, CurrentUser
from typing import Optional

logger = get_logger(__name__)
from models.tool_model import ToolInfoJson
from services.tool_service import tool_service
from services.config_service import config_service
from services.db_service import db_service
from utils.http_client import HttpClient
# services
from models.config_model import ModelInfo
from typing import List
from services.tool_service import TOOL_MAPPING
from dotenv import load_dotenv
load_dotenv()

router = APIRouter(prefix="/api")


def get_ollama_model_list() -> List[str]:
    base_url = config_service.get_config().get('ollama', {}).get(
        'url', os.getenv('OLLAMA_HOST', 'http://localhost:11434'))
    try:
        response = requests.get(f'{base_url}/api/tags', timeout=5)
        response.raise_for_status()
        data = response.json()
        return [model['name'] for model in data.get('models', [])]
    except requests.RequestException as e:
        logger.error(f"Error querying Ollama: {e}")
        return []


async def get_comfyui_model_list(base_url: str) -> List[str]:
    """Get ComfyUI model list from object_info API"""
    try:
        timeout = httpx.Timeout(10.0)
        async with HttpClient.create(timeout=timeout) as client:
            response = await client.get(f"{base_url}/api/object_info")
            if response.status_code == 200:
                data = response.json()
                # Extract models from CheckpointLoaderSimple node
                models = data.get('CheckpointLoaderSimple', {}).get(
                    'input', {}).get('required', {}).get('ckpt_name', [[]])[0]
                return models if isinstance(models, list) else []  # type: ignore
            else:
                print(f"ComfyUI server returned status {response.status_code}")
                return []
    except Exception as e:
        logger.error(f"Error querying ComfyUI: {e}")
        return []

# List all LLM models
@router.get("/list_models")
async def get_models(request: Request, current_user: Optional[CurrentUser] = Depends(get_current_user_optional)) -> list[ModelInfo]:
    config = config_service.get_config()
    res: List[ModelInfo] = []

    # 先关闭本地ollama的调用
    # Handle Ollama models separately
    # ollama_url = config.get('ollama', {}).get(
    #     'url', os.getenv('OLLAMA_HOST', 'http://localhost:11434'))
    # # Add Ollama models if URL is available
    # if ollama_url and ollama_url.strip():
    #     ollama_models = get_ollama_model_list()
    #     for ollama_model in ollama_models:
    #         res.append({
    #             'provider': 'ollama',
    #             'model': ollama_model,
    #             'url': ollama_url,
    #             'type': 'text'
    #         })

    for provider in config.keys():
        if provider in ['ollama']:
            continue

        provider_config = config[provider]
        provider_url = provider_config.get('url', '').strip()
        provider_api_key = provider_config.get('api_key', '').strip()

        # Skip provider if URL is empty or API key is empty
        if not provider_url or not provider_api_key:
            continue

        models = provider_config.get('models', {})
        for model_name in models:
            model = models[model_name]
            model_type = model.get('type', 'text')
            # Only return text models
            if model_type == 'text':
                res.append({
                    'provider': provider,
                    'model': model_name,
                    'url': provider_url,
                    'type': model_type
                })
    return res


@router.get("/list_tools")
async def list_tools(request: Request, current_user: Optional[CurrentUser] = Depends(get_current_user_optional)) -> list[ToolInfoJson]:
    config = config_service.get_config()
    res: list[ToolInfoJson] = []
    for tool_id, tool_info in tool_service.tools.items():
        if tool_info.get('provider') == 'system':
            continue
        provider = tool_info['provider']
        logger.info(f"tool_info: {tool_info}")
        provider_api_key = config[provider].get('api_key', '').strip()
        if provider != 'comfyui' and not provider_api_key:
            continue
        
        res.append({
            'id': tool_id,
            'provider': tool_info.get('provider', ''),
            'type': tool_info.get('type', ''),
            'display_name': tool_info.get('display_name', ''),
        })

    # Handle ComfyUI models separately
    # comfyui_config = config.get('comfyui', {})
    # comfyui_url = comfyui_config.get('url', '').strip()
    # comfyui_config_models = comfyui_config.get('models', {})
    # if comfyui_url:
    #     comfyui_models = await get_comfyui_model_list(comfyui_url)
    #     for comfyui_model in comfyui_models:
    #         if comfyui_model in comfyui_config_models:
    #             res.append({
    #                 'provider': 'comfyui',
    #                 'model': comfyui_model,
    #                 'url': comfyui_url,
    #                 'type': 'image'
    #             })

    return res


@router.get("/list_chat_sessions")
async def list_chat_sessions(request: Request, current_user: Optional[CurrentUser] = Depends(get_current_user_optional)):
    user_uuid = get_user_uuid_for_database_operations(current_user)
    return await db_service.list_sessions(user_uuid=user_uuid)


@router.get("/chat_session/{session_id}")
async def get_chat_session(session_id: str, request: Request, current_user: Optional[CurrentUser] = Depends(get_current_user_optional)):
    user_uuid = get_user_uuid_for_database_operations(current_user)
    return await db_service.get_chat_history(session_id, user_uuid=user_uuid)


@router.post("/create_checkout")
async def create_checkout(request: Request):
    """创建支付订单"""
    try:
        # 🔧 导入必要的依赖（放在函数开始处避免作用域问题）
        from routers.auth_router import verify_access_token
        from services.db_service import db_service
        
        # 🔧 获取当前用户信息（支持多种认证方式）
        user_uuid = None
        user_email = "anonymous"
        user_id = None
        
        # 方式1: 检查Authorization header (Bearer token)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            logger.info("🔑 Found Authorization header, checking Bearer token...")
            token = auth_header[7:]
            user_payload = verify_access_token(token)
            if user_payload:
                user_id = user_payload.get("user_id")
                logger.info(f"🔑 User authenticated via Bearer token: user_id={user_id}")
            else:
                logger.warning("🔑 Bearer token verification failed")
        else:
            logger.info("🔍 No Authorization header found")
        
        # 方式2: 检查httpOnly cookies (如果Bearer token不存在或验证失败)
        if not user_id:
            logger.info("🔍 Bearer token authentication failed or not found, checking httpOnly cookies...")
            
            # 显示所有cookies用于调试
            all_cookies = dict(request.cookies)
            logger.info(f"🍪 Available cookies: {list(all_cookies.keys())}")
            
            auth_token = request.cookies.get("auth_token")
            if auth_token:
                logger.info(f"🍪 Found auth_token cookie: {auth_token[:30]}...")
                user_payload = verify_access_token(auth_token)
                if user_payload:
                    user_id = user_payload.get("user_id")
                    logger.info(f"🍪 User authenticated via httpOnly cookie: user_id={user_id}")
                else:
                    logger.warning("🍪 auth_token cookie verification failed")
                    logger.warning(f"🍪 Cookie token: {auth_token[:50]}...")
            else:
                logger.warning("🍪 No auth_token cookie found")
        else:
            logger.info("🔑 Skipping cookie check - already authenticated via Bearer token")
        
        # 获取完整用户信息
        if user_id:
            logger.info(f"🔍 Looking up user info for user_id={user_id}")
            user = await db_service.get_user_by_id(user_id)
            if user:
                user_uuid = user['uuid']
                user_email = user['email']
                logger.info(f"✅ Authenticated user: {user_email} (uuid: {user_uuid})")
            else:
                logger.warning(f"❌ User ID {user_id} not found in database")
        
        # 如果没有用户信息，使用匿名用户
        if not user_uuid:
            logger.warning("⚠️ No user authentication found, falling back to anonymous user")
            anonymous_user = await db_service.get_user_by_id(1)
            user_uuid = anonymous_user['uuid'] if anonymous_user else 'anonymous'
            logger.warning(f"⚠️ Using anonymous user: {user_uuid}")
        
        timeout = httpx.Timeout(10.0)
        async with HttpClient.create(timeout=timeout) as client:
            api_key = os.getenv("CREEM_API_KEY")
            if not api_key:
                raise ValueError("CREEM_API_KEY environment variable is not set")
            response = await client.post(
                f"{os.getenv('CREEM_API_URL')}/v1/checkouts",
                headers={
                    "Content-Type": "application/json",
                    "x-api-key": api_key
                },
                json={
                    'product_id': 'prod_1Pnf8nR8OUqp55ziFzDNLM'
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                logger.info(f"Creem API返回数据: {data}")
                
                # 提取关键信息
                checkout_url = data.get('checkout_url')
                order_id = data.get('order_id')  # Creem返回的订单ID
                checkout_id = data.get('id') or data.get('checkout_id')
                
                # 创建本地订单记录，保存Creem相关信息
                if checkout_id and user_uuid:
                    from services.db_service import db_service
                    local_order_id = await db_service.create_order(
                        user_uuid=user_uuid,
                        product_id='prod_1Pnf8nR8OUqp55ziFzDNLM',
                        price_cents=999  # base plan price
                    )
                    
                    # 更新订单记录，保存Creem相关信息
                    await db_service.update_order_creem_info(
                        order_id=local_order_id,
                        creem_order_id=order_id,  # 可能为None
                        creem_checkout_id=checkout_id
                    )
                    
                    logger.info(f"已创建本地订单 {local_order_id}，checkout_id: {checkout_id}, order_id: {order_id}")
                
                return {
                    'success': True, 
                    'checkout_url': checkout_url,  # Creem支付页面URL
                    'order_id': order_id,
                    'checkout_id': checkout_id,
                    'redirect_mode': True,         # 标识使用页面跳转模式
                    'same_window': True           # 标识在同一窗口跳转
                }
            else:
                logger.error(f"Creem API调用失败: {response.status_code}, 响应: {response.text}")
                return {'success': False, 'error': f'API调用失败: {response.status_code}'}
                
    except Exception as e:
        logger.error(f"创建支付订单失败: {e}")
        return {'success': False, 'error': '创建支付订单失败'}

@router.get("/payment_proxy/{checkout_id}")
async def payment_proxy(checkout_id: str):
    """支付页面代理，用于iframe嵌入"""
    try:
        # 构建Creem支付页面URL
        creem_url = f"https://creem.io/test/checkout/prod_1Pnf8nR8OUqp55ziFzDNLM/{checkout_id}"
        
        # 返回一个HTML页面，包含iframe和通信逻辑
        proxy_html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>支付处理</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * {{
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }}
                
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #f8f9fa;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }}
                
                .header {{
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 1rem;
                    text-align: center;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }}
                
                .header h1 {{
                    font-size: 1.2rem;
                    font-weight: 600;
                    margin: 0;
                }}
                
                .payment-container {{
                    flex: 1;
                    position: relative;
                    background: white;
                    margin: 1rem;
                    border-radius: 10px;
                    overflow: hidden;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
                }}
                
                #payment-frame {{
                    width: 100%;
                    height: 100%;
                    border: none;
                    display: block;
                }}
                
                .loading-overlay {{
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: white;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10;
                }}
                
                .loading-content {{
                    text-align: center;
                    color: #666;
                }}
                
                .spinner {{
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #667eea;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 1rem;
                }}
                
                @keyframes spin {{
                    0% {{ transform: rotate(0deg); }}
                    100% {{ transform: rotate(360deg); }}
                }}
                
                .error-message {{
                    display: none;
                    text-align: center;
                    padding: 2rem;
                    color: #dc3545;
                }}
                
                @media (max-width: 768px) {{
                    .payment-container {{
                        margin: 0.5rem;
                        border-radius: 5px;
                    }}
                    
                    .header {{
                        padding: 0.75rem;
                    }}
                    
                    .header h1 {{
                        font-size: 1rem;
                    }}
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🔒 安全支付</h1>
            </div>
            
            <div class="payment-container">
                <div id="loading-overlay" class="loading-overlay">
                    <div class="loading-content">
                        <div class="spinner"></div>
                        <p>正在加载支付页面...</p>
                    </div>
                </div>
                
                <div id="error-message" class="error-message">
                    <h3>❌ 支付页面加载失败</h3>
                    <p>请刷新页面重试，或联系客服处理</p>
                </div>
                
                <iframe id="payment-frame" src="{creem_url}" allowfullscreen></iframe>
            </div>
            
            <script>
                const loadingOverlay = document.getElementById('loading-overlay');
                const errorMessage = document.getElementById('error-message');
                const paymentFrame = document.getElementById('payment-frame');
                
                // 设置加载超时
                const loadingTimeout = setTimeout(() => {{
                    loadingOverlay.style.display = 'none';
                    errorMessage.style.display = 'block';
                }}, 15000); // 15秒超时
                
                // iframe加载完成
                paymentFrame.onload = function() {{
                    clearTimeout(loadingTimeout);
                    loadingOverlay.style.display = 'none';
                    
                    // 尝试监听iframe内的页面变化
                    try {{
                        // 检查是否跳转到了成功页面
                        const checkPaymentCompletion = setInterval(() => {{
                            try {{
                                const frameUrl = paymentFrame.contentWindow.location.href;
                                
                                // 如果URL包含我们的回调地址，说明支付完成
                                if (frameUrl.includes('/payments')) {{
                                    clearInterval(checkPaymentCompletion);
                                    
                                    // 通知父页面支付可能完成
                                    if (window.parent && window.parent !== window) {{
                                        window.parent.postMessage({{
                                            type: 'PAYMENT_REDIRECT_DETECTED',
                                            message: '检测到支付跳转，可能已完成支付'
                                        }}, '*');
                                    }}
                                }}
                            }} catch (e) {{
                                // 跨域限制，无法访问iframe的URL
                                // 这是正常的，不需要处理
                            }}
                        }}, 1000);
                        
                        // 5分钟后停止检查
                        setTimeout(() => {{
                            clearInterval(checkPaymentCompletion);
                        }}, 300000);
                        
                    }} catch (e) {{
                        console.log('Unable to monitor iframe URL due to cross-origin restrictions');
                    }}
                }};
                
                // iframe加载错误
                paymentFrame.onerror = function() {{
                    clearTimeout(loadingTimeout);
                    loadingOverlay.style.display = 'none';
                    errorMessage.style.display = 'block';
                }};
                
                // 监听消息（虽然Creem可能不支持postMessage）
                window.addEventListener('message', function(event) {{
                    // 转发给父页面
                    if (window.parent && window.parent !== window) {{
                        window.parent.postMessage(event.data, '*');
                    }}
                }});
                
                // 定期向父页面发送心跳
                setInterval(() => {{
                    if (window.parent && window.parent !== window) {{
                        window.parent.postMessage({{
                            type: 'PAYMENT_FRAME_HEARTBEAT',
                            timestamp: Date.now()
                        }}, '*');
                    }}
                }}, 5000);
            </script>
        </body>
        </html>
        """
        
        from fastapi.responses import HTMLResponse
        return HTMLResponse(content=proxy_html, status_code=200)
        
    except Exception as e:
        logger.error(f"Error creating payment proxy: {e}")
        from fastapi.responses import HTMLResponse
        error_html = f"""
        <!DOCTYPE html>
        <html>
        <head><title>支付错误</title></head>
        <body>
            <h1>支付页面加载失败</h1>
            <p>错误: {str(e)}</p>
            <button onclick="window.close()">关闭</button>
        </body>
        </html>
        """
        return HTMLResponse(content=error_html, status_code=500)
