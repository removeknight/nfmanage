"""Create initial water management tables.

Revision ID: 0001_initial
Revises:
"""
from alembic import op
from app.database import Base
from app import models  # noqa: F401

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    tables = [table for table in Base.metadata.sorted_tables if table.name != "operation_logs"]
    Base.metadata.create_all(bind=op.get_bind(), tables=tables)

def downgrade():
    tables = [table for table in Base.metadata.sorted_tables if table.name != "operation_logs"]
    Base.metadata.drop_all(bind=op.get_bind(), tables=tables)
