"""Server-owned merchant roles and expiring, revocable login sessions."""
from alembic import op
import sqlalchemy as sa
from app.settings import settings

revision = "0009_merchant_access"
down_revision = "0008_order_fulfillment"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("customers", sa.Column("auth_provider", sa.String(12), nullable=False, server_default=""))
    op.add_column("customers", sa.Column("auth_app_id", sa.String(80), nullable=False, server_default=""))
    conn = op.get_bind()
    conn.execute(sa.text("""UPDATE customers SET auth_provider=CASE WHEN left(wechat_openid,5)='test_' THEN 'mock' ELSE 'wechat' END,
        auth_app_id=CASE WHEN left(wechat_openid,5)='test_' THEN 'mock' ELSE :appid END WHERE source='mini'"""),
        {"appid": settings.wechat_app_id})
    op.drop_constraint("uq_customer_source_openid", "customers", type_="unique")
    op.create_unique_constraint("uq_customer_app_openid", "customers", ["source", "auth_app_id", "wechat_openid"])
    op.create_table("auth_sessions", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False, server_default="mini"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False), sa.Column("revoked_at", sa.DateTime()))
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"], unique=True)
    op.create_index("ix_auth_sessions_customer_id", "auth_sessions", ["customer_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])
    op.execute("""INSERT INTO auth_sessions(token_hash,customer_id,kind,expires_at)
        SELECT mini_token_hash,id,'mini',CURRENT_TIMESTAMP + INTERVAL '7 days'
        FROM customers WHERE source='mini' AND mini_token_hash IS NOT NULL""")
    op.create_table("merchant_members",
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), primary_key=True),
        sa.Column("role", sa.String(12), nullable=False), sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("granted_by", sa.Integer(), sa.ForeignKey("customers.id")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_table("merchant_codes", sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code_hash", sa.String(64), nullable=False), sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("customers.id")),
        sa.Column("used_by", sa.Integer(), sa.ForeignKey("customers.id")),
        sa.Column("expires_at", sa.DateTime(), nullable=False), sa.Column("used_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_merchant_codes_code_hash", "merchant_codes", ["code_hash"], unique=True)
    op.create_index("ix_merchant_codes_expires_at", "merchant_codes", ["expires_at"])
    op.create_table("merchant_control", sa.Column("id", sa.Integer(), primary_key=True))
    op.execute("INSERT INTO merchant_control(id) VALUES(1)")


def downgrade():
    op.drop_table("merchant_codes")
    op.drop_table("merchant_members")
    op.drop_table("merchant_control")
    op.drop_table("auth_sessions")
    op.drop_constraint("uq_customer_app_openid", "customers", type_="unique")
    op.create_unique_constraint("uq_customer_source_openid", "customers", ["source", "wechat_openid"])
    op.drop_column("customers", "auth_app_id")
    op.drop_column("customers", "auth_provider")
