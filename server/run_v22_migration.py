#!/usr/bin/env python3
"""
Run v22 migration: Add Stripe payment support fields
"""
import sqlite3
import sys
import os

# Add server directory to path
sys.path.insert(0, os.path.dirname(__file__))

from services.db_service import DB_PATH
from services.migrations.v22_add_stripe_support import V22AddStripeSupport


def check_current_version(db_path: str) -> int:
    """Check current database version"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT version FROM db_version")
    version = cursor.fetchone()[0]
    conn.close()
    return version


def run_migration(db_path: str):
    """Run the v22 Stripe support migration"""
    print(f"🔍 Checking database: {db_path}")

    current_version = check_current_version(db_path)
    print(f"   - Current database version: {current_version}")

    if current_version >= 22:
        print("✅ Database is already at version 22 or higher, no migration needed")
        return

    if current_version != 21:
        print(f"⚠️  Warning: Database is at version {current_version}, not 21. Migration may fail.")
        response = input("Continue anyway? (y/n): ")
        if response.lower() != 'y':
            print("Migration cancelled")
            return

    print("\n🎯 Starting v22 migration...")

    conn = sqlite3.connect(db_path)

    try:
        # Run the migration
        migration = V22AddStripeSupport()
        print(f"   Running migration {migration.version}: {migration.description}")
        migration.up(conn)

        # Update version
        conn.execute("UPDATE db_version SET version = 22")
        conn.commit()

        print("\n✅ Migration completed successfully!")
        print("   Added Stripe support with:")
        print("   - payment_provider field to track payment method")
        print("   - Stripe-specific fields in tb_orders")
        print("   - stripe_price_id field in tb_products")
        print("   - Stripe customer tracking in tb_user")

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Migration failed: {e}")
        raise
    finally:
        conn.close()


def main():
    """Main function"""
    print("=" * 70)
    print("Migration v22: Add Stripe Payment Support")
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

    # Run migration
    run_migration(db_path)

    print("\n" + "=" * 70)
    print("Migration completed")
    print("=" * 70)


if __name__ == "__main__":
    main()