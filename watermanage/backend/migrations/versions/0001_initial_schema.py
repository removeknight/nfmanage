"""Initial schema snapshot; independent of models added by later revisions."""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("brand", sa.String(80), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("capacity", sa.String(40), nullable=False),
        sa.Column("package_type", sa.String(40), nullable=False),
        sa.Column("color", sa.String(20), nullable=False),
        sa.Column("image_url", sa.String(500), nullable=True),
        sa.Column("stock", sa.Integer(), nullable=False),
        sa.Column("warning_stock", sa.Integer(), nullable=False),
        sa.Column("average_cost", sa.Numeric(14, 4), nullable=False),
        sa.Column("sell_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False))
    for column in ("name", "brand"):
        op.create_index("ix_products_"+column, "products", [column])
    op.create_table("customers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("phone", sa.String(40), nullable=False),
        sa.Column("address", sa.String(300), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False))
    op.create_index("ix_customers_name", "customers", ["name"])
    op.create_table("transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("total", sa.Numeric(14, 2), nullable=False),
        sa.Column("note", sa.String(300), nullable=False),
        sa.Column("operator", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False))
    for column in ("kind", "product_id", "created_at"):
        op.create_index("ix_transactions_"+column, "transactions", [column])
    op.create_table("deliveries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("address", sa.String(300), nullable=False),
        sa.Column("note", sa.String(300), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False))
    for column in ("customer_id", "product_id", "status", "created_at"):
        op.create_index("ix_deliveries_"+column, "deliveries", [column])


def downgrade():
    for name in ("deliveries", "transactions", "customers", "products"):
        op.drop_table(name)
