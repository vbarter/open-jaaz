#!/usr/bin/env python3
"""
获取或创建Stripe产品的价格ID
"""
import stripe
import os
from dotenv import load_dotenv

load_dotenv()

# 设置Stripe API密钥
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

def get_or_create_price():
    """获取或创建Stripe价格"""

    product_id = "prod_TTcfdkYYPLJm7p"

    print(f"🔍 查找产品 {product_id} 的价格...")

    try:
        # 首先列出该产品的所有价格
        prices = stripe.Price.list(product=product_id, limit=10)

        if prices.data:
            print(f"\n✅ 找到 {len(prices.data)} 个价格:\n")
            for price in prices.data:
                price_str = f"${price.unit_amount/100:.2f}" if price.unit_amount else "Custom"
                recurring = ""
                if price.recurring:
                    interval = price.recurring.interval
                    interval_count = price.recurring.interval_count
                    if interval_count == 1:
                        recurring = f" / {interval}"
                    else:
                        recurring = f" / {interval_count} {interval}s"

                print(f"  价格ID: {price.id}")
                print(f"  金额: {price_str}{recurring}")
                print(f"  货币: {price.currency.upper()}")
                print(f"  状态: {'Active' if price.active else 'Inactive'}")
                print(f"  类型: {'Recurring' if price.recurring else 'One-time'}")
                print()

            # 返回第一个激活的月度价格（如果存在）
            for price in prices.data:
                if price.active and price.recurring and price.recurring.interval == "month":
                    print(f"🎯 选择月度价格: {price.id}")
                    return price.id

            # 如果没有月度价格，返回第一个激活的价格
            for price in prices.data:
                if price.active:
                    print(f"🎯 选择第一个激活价格: {price.id}")
                    return price.id

            print("⚠️ 没有找到激活的价格")

        else:
            print(f"⚠️ 产品 {product_id} 没有价格")

        # 询问是否创建新价格
        response = input("\n是否创建新的月度订阅价格？(y/n): ")
        if response.lower() == 'y':
            # 创建新的月度订阅价格
            price_amount = input("请输入月度价格（美元，如 9.99）: ")
            price_cents = int(float(price_amount) * 100)

            print(f"\n创建新价格: ${price_amount}/月...")

            new_price = stripe.Price.create(
                product=product_id,
                unit_amount=price_cents,
                currency="usd",
                recurring={"interval": "month"}
            )

            print(f"✅ 价格创建成功！")
            print(f"   价格ID: {new_price.id}")
            print(f"   金额: ${new_price.unit_amount/100:.2f}/月")

            return new_price.id

    except stripe.error.InvalidRequestError as e:
        print(f"❌ 错误: {e}")
        print("\n可能的原因：")
        print("1. 产品ID不存在")
        print("2. API密钥无效")
        print("3. 没有权限访问该产品")
        return None

    except Exception as e:
        print(f"❌ 意外错误: {e}")
        return None

    return None

def main():
    print("=" * 60)
    print("Stripe 价格查询/创建工具")
    print("=" * 60)

    # 验证API密钥
    if not stripe.api_key or "YOUR" in stripe.api_key:
        print("❌ 请先在.env文件中设置正确的STRIPE_SECRET_KEY")
        return

    price_id = get_or_create_price()

    if price_id:
        print("\n" + "=" * 60)
        print("下一步操作：")
        print("=" * 60)
        print(f"\n1. 更新数据库中base_monthly产品的stripe_price_id：")
        print(f"   sqlite3 /Users/caijunjie/Dev/open-jaaz/server/user_data/localmanus.db")
        print(f'   UPDATE tb_products SET stripe_price_id = "{price_id}"')
        print(f'   WHERE level = "base_monthly";')
        print(f"\n2. 测试支付流程")
        print(f"\n3. 在Stripe Dashboard设置Webhook：")
        print(f"   URL: https://your-domain.com/api/stripe/webhook")
        print(f"   事件: checkout.session.completed, customer.subscription.deleted")

if __name__ == "__main__":
    main()