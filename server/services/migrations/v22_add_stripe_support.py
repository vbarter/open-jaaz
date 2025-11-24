from . import Migration
import sqlite3


class V22AddStripeSupport(Migration):
    version = 22
    description = "Add Stripe payment support fields to orders and products tables"

    def up(self, conn: sqlite3.Connection) -> None:
        """Add Stripe-related columns to support dual payment providers"""

        print("🎯 Adding Stripe support to payment tables...")

        # Add payment_provider column to tb_orders
        print("  📝 Adding payment_provider column to tb_orders...")
        conn.execute("""
            ALTER TABLE tb_orders
            ADD COLUMN payment_provider TEXT DEFAULT 'creem'
            CHECK (payment_provider IN ('creem', 'stripe'))
        """)

        # Add Stripe-specific columns to tb_orders
        print("  📝 Adding Stripe session ID column to tb_orders...")
        conn.execute("""
            ALTER TABLE tb_orders
            ADD COLUMN stripe_session_id TEXT
        """)

        print("  📝 Adding Stripe payment intent ID column to tb_orders...")
        conn.execute("""
            ALTER TABLE tb_orders
            ADD COLUMN stripe_payment_intent_id TEXT
        """)

        print("  📝 Adding Stripe subscription ID column to tb_orders...")
        conn.execute("""
            ALTER TABLE tb_orders
            ADD COLUMN stripe_subscription_id TEXT
        """)

        print("  📝 Adding Stripe customer ID column to tb_orders...")
        conn.execute("""
            ALTER TABLE tb_orders
            ADD COLUMN stripe_customer_id TEXT
        """)

        # Add stripe_price_id column to tb_products
        print("  📝 Adding stripe_price_id column to tb_products...")
        conn.execute("""
            ALTER TABLE tb_products
            ADD COLUMN stripe_price_id TEXT
        """)

        # Create indexes for efficient lookups
        print("  🔍 Creating indexes for Stripe fields...")

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tb_orders_payment_provider
            ON tb_orders(payment_provider)
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tb_orders_stripe_session_id
            ON tb_orders(stripe_session_id)
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tb_orders_stripe_subscription_id
            ON tb_orders(stripe_subscription_id)
        """)

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_tb_products_stripe_price_id
            ON tb_products(stripe_price_id)
        """)

        # Update existing orders to explicitly mark them as Creem
        print("  🔄 Marking existing orders as Creem provider...")
        conn.execute("""
            UPDATE tb_orders
            SET payment_provider = 'creem',
                updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE payment_provider IS NULL
        """)

        # Add sample Stripe price IDs for testing (you'll need to update these with real Stripe IDs)
        print("  🎨 Adding sample Stripe price IDs to products...")

        # Map common subscription levels to Stripe price IDs (these are placeholders)
        stripe_price_mappings = [
            ("base_monthly", "price_1QStripeBaseMonthly"),
            ("base_yearly", "price_1QStripeBaseYearly"),
            ("pro_monthly", "price_1QStripeProMonthly"),
            ("pro_yearly", "price_1QStripeProYearly"),
            ("max_monthly", "price_1QStripeMaxMonthly"),
            ("max_yearly", "price_1QStripeMaxYearly"),
        ]

        for level, stripe_price_id in stripe_price_mappings:
            conn.execute("""
                UPDATE tb_products
                SET stripe_price_id = ?,
                    updated_at = STRFTIME('%Y-%m-%dT%H:%M:%fZ', 'now')
                WHERE level = ? AND stripe_price_id IS NULL
            """, (stripe_price_id, level))

        # Also add columns to tb_user for Stripe customer tracking
        print("  👤 Adding Stripe customer ID to tb_user...")
        try:
            conn.execute("""
                ALTER TABLE tb_user
                ADD COLUMN stripe_customer_id TEXT
            """)

            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_tb_user_stripe_customer_id
                ON tb_user(stripe_customer_id)
            """)
        except sqlite3.OperationalError as e:
            if "duplicate column name" not in str(e).lower():
                raise
            print("    ⚠️ stripe_customer_id column already exists in tb_user")

        print("✅ Stripe support added successfully")
        print("✅ Payment provider field added with constraint (creem, stripe)")
        print("✅ Stripe-specific fields added to orders table")
        print("✅ Stripe price ID field added to products table")
        print("✅ Indexes created for efficient queries")
        print("⚠️ Remember to update stripe_price_id values with actual Stripe Price IDs")

    def down(self, conn: sqlite3.Connection) -> None:
        """Rollback Stripe support addition (not implemented for safety)"""
        print("⚠️ Rollback for Stripe support migration is not implemented for data safety")
        print("   To manually rollback, you would need to:")
        print("   1. Drop the new columns from tb_orders, tb_products, and tb_user")
        print("   2. Drop the created indexes")
        print("   3. Ensure no data loss for existing Stripe transactions")
        pass