"""Add certificates table

Revision ID: add_certificates_table
Revises: 
Create Date: 2025-11-24 14:13:00

"""
from alembic import op
import sqlalchemy as sa
from datetime import datetime

# revision identifiers, used by Alembic.
revision = 'add_certificates_table'
down_revision = None  # Will be updated based on existing migrations
branch_labels = None
depends_on = None


def upgrade():
    # Create certificates table
    op.create_table(
        'certificates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('ca_cert', sa.LargeBinary(), nullable=True),
        sa.Column('client_cert', sa.LargeBinary(), nullable=True),
        sa.Column('client_key', sa.LargeBinary(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True, default=datetime.utcnow),
        sa.Column('updated_at', sa.DateTime(), nullable=True, default=datetime.utcnow),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_certificates_id'), 'certificates', ['id'], unique=False)
    op.create_index(op.f('ix_certificates_name'), 'certificates', ['name'], unique=True)


def downgrade():
    op.drop_index(op.f('ix_certificates_name'), table_name='certificates')
    op.drop_index(op.f('ix_certificates_id'), table_name='certificates')
    op.drop_table('certificates')
