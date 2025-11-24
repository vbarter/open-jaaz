#!/usr/bin/env python3
"""
Add Stripe price IDs to products for testing
Note: These are placeholder IDs - replace with actual Stripe Price IDs from your Stripe dashboard
"""
import sqlite3
import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.dirname(__file__))

from services.db_service import DB_PATH


def add_stripe_price_ids(db_path: str):
    """Add Stripe price IDs to products"""

    # 注意：这些是测试用的占位符ID
    # 实际使用时，需要从Stripe Dashboard创建产品和价格，然后使用真实的Price ID
    # Stripe Price ID格式通常是: price_1XXXXXXXXXXXXXXXXXXXXX

    stripe_price_mappings = [
        # (level, stripe_price_id)
        ("base_monthly", "price_1QTestBaseMonthlyXXXXXXX"),
        ("base_yearly", "price_1QTestBaseYearlyXXXXXXXX"),
        ("pro_monthly", "price_1QTestProMonthlyXXXXXXXX"),
        ("pro_yearly", "price_1QTestProYearlyXXXXXXXXX"),
        ("max_monthly", "price_1QTestMaxMonthlyXXXXXXXX"),
        ("max_yearly", "price_1QTestMaxYearlyXXXXXXXXX"),
    ]

    print(f"🔍 Updating products in database: {db_path}")
    print("\n⚠️  注意: 这些是测试用的占位符Stripe Price ID")
    print("   实际部署时，请按以下步骤操作:")
    print("   1. 登录Stripe Dashboard (https://dashboard.stripe.com)")
    print("   2. 创建产品和价格")
    print("   3. 获取真实的Price ID (格式: price_1XXXXXXXXXXXXXXXXXXXXX)")
    print("   4. 更新数据库中的stripe_price_id字段")
    print()

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        for level, stripe_price_id in stripe_price_mappings:
            # 检查产品是否存在
            cursor.execute("SELECT product_id, name FROM tb_products WHERE level = ?", (level,))
            product = cursor.fetchone()

            if product:
                product_id, product_name = product

                # 更新Stripe price ID
                cursor.execute("""
                    UPDATE tb_products
                    SET stripe_price_id = ?,
                        updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE level = ?
                """, (stripe_price_id, level))

                print(f"✅ Updated {product_name} (level: {level})")
                print(f"   Product ID: {product_id}")
                print(f"   Stripe Price ID: {stripe_price_id}")
            else:
                print(f"⚠️  Product not found for level: {level}")

        conn.commit()
        print("\n✅ Stripe price IDs added successfully!")

        # 显示更新后的产品信息
        print("\n📋 Current products with Stripe price IDs:")
        cursor.execute("""
            SELECT product_id, name, level, stripe_price_id
            FROM tb_products
            ORDER BY level
        """)

        for row in cursor.fetchall():
            product_id, name, level, stripe_price_id = row
            status = "✅" if stripe_price_id else "❌"
            print(f"   {status} {name} ({level}): {stripe_price_id or 'Not set'}")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Error updating Stripe price IDs: {e}")
        raise
    finally:
        conn.close()


def main():
    """Main function"""
    print("=" * 70)
    print("Add Stripe Price IDs to Products")
    print("=" * 70)

    # Get DB path
    db_path = DB_PATH

    if len(sys.argv) > 1:
        db_path = sys.argv[1]

    print(f"\nDatabase: {db_path}\n")

    # Check if database exists
    if not os.path.exists(db_path):
        print(f"❌ Database not found: {db_path}")
        sys.exit(1)

    # Add Stripe price IDs
    add_stripe_price_ids(db_path)

    print("\n" + "=" * 70)
    print("Update completed")
    print("=" * 70)

    print("\n🎯 Next steps for production:")
    print("   1. Create products in Stripe Dashboard")
    print("   2. Get real Price IDs")
    print("   3. Update the database with real IDs")
    print("   4. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in .env")
    print("   5. Configure webhook endpoint in Stripe Dashboard")
    print("   6. Test the payment flow")


if __name__ == "__main__":
    main()