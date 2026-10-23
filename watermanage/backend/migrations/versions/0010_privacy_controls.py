"""Versioned legal documents, explicit consent, and merchant contact settings."""
from alembic import op
import sqlalchemy as sa

revision = "0010_privacy_controls"
down_revision = "0009_merchant_access"
branch_labels = None
depends_on = None


def upgrade():
    for name in ("privacy_version", "terms_version"):
        op.add_column("customers", sa.Column(name, sa.String(64), nullable=False, server_default=""))
    for name in ("agreement_accepted_at", "address_consent_at"):
        op.add_column("customers", sa.Column(name, sa.DateTime(), nullable=True))
    op.create_table("privacy_settings", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("operator_name", sa.String(120), nullable=False),
                    sa.Column("contact_phone", sa.String(40), nullable=False))
    op.execute("INSERT INTO privacy_settings(id,operator_name,contact_phone) VALUES(1,'农丰水站','13324205796')")
    op.create_table("legal_documents", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("kind", sa.String(20), nullable=False), sa.Column("version", sa.String(64), nullable=False),
                    sa.Column("title", sa.String(80), nullable=False), sa.Column("content", sa.Text(), nullable=False),
                    sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
                    sa.UniqueConstraint("kind", "version", name="uq_legal_document_version"))
    op.create_table("legal_consents", sa.Column("id", sa.Integer(), primary_key=True),
                    sa.Column("customer_id", sa.Integer(), sa.ForeignKey("customers.id"), nullable=False),
                    sa.Column("privacy_version", sa.String(64), nullable=False),
                    sa.Column("terms_version", sa.String(64), nullable=False),
                    sa.Column("address_allowed", sa.Boolean(), nullable=False),
                    sa.Column("source", sa.String(20), nullable=False),
                    sa.Column("accepted_at", sa.DateTime(), nullable=False, server_default=sa.func.now()))
    op.create_index("ix_legal_consents_customer_id", "legal_consents", ["customer_id"])


def downgrade():
    op.drop_table("legal_consents")
    op.drop_table("legal_documents")
    op.drop_table("privacy_settings")
    for name in ("address_consent_at", "agreement_accepted_at", "terms_version", "privacy_version"):
        op.drop_column("customers", name)
