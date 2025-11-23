#!/bin/bash

################################################################################
# VistaIOT Gateway - Setup Script
# 
# This script installs all dependencies and sets up the VistaIOT Gateway
# application for both development and production environments.
#
# Usage:
#   sudo ./setup.sh              # Full setup with system dependencies
#   ./setup.sh --no-system       # Skip system dependencies (dev only)
#   ./setup.sh --production      # Production setup with systemd service
#
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/frontend"
VENV_DIR="$BACKEND_DIR/venv"
SERVICE_NAME="vistaiot-gateway"
BUFFER_DIR="/var/lib/vistaiot/buffered_data"

# Parse arguments
SKIP_SYSTEM=false
PRODUCTION=false

for arg in "$@"; do
    case $arg in
        --no-system)
            SKIP_SYSTEM=true
            shift
            ;;
        --production)
            PRODUCTION=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --no-system      Skip system package installation"
            echo "  --production     Setup for production with systemd service"
            echo "  --help           Show this help message"
            exit 0
            ;;
    esac
done

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

check_command() {
    if command -v $1 &> /dev/null; then
        print_success "$1 is installed"
        return 0
    else
        print_error "$1 is not installed"
        return 1
    fi
}

################################################################################
# System Dependencies
################################################################################

install_system_dependencies() {
    print_header "Installing System Dependencies"
    
    if [ "$SKIP_SYSTEM" = true ]; then
        print_warning "Skipping system dependencies (--no-system flag)"
        return 0
    fi
    
    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        print_error "System dependencies require root privileges"
        print_info "Please run: sudo ./setup.sh"
        exit 1
    fi
    
    # Detect OS
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
    else
        print_error "Cannot detect OS"
        exit 1
    fi
    
    print_info "Detected OS: $OS"
    
    # Install based on OS
    case $OS in
        ubuntu|debian)
            print_info "Installing packages for Debian/Ubuntu..."
            apt-get update
            apt-get install -y \
                python3 \
                python3-pip \
                python3-venv \
                nodejs \
                npm \
                git \
                network-manager \
                iproute2 \
                iputils-ping \
                sqlite3 \
                build-essential \
                python3-dev
            print_success "System packages installed"
            ;;
        
        fedora|rhel|centos)
            print_info "Installing packages for Fedora/RHEL/CentOS..."
            dnf install -y \
                python3 \
                python3-pip \
                nodejs \
                npm \
                git \
                NetworkManager \
                iproute \
                iputils \
                sqlite \
                gcc \
                python3-devel
            print_success "System packages installed"
            ;;
        
        arch|manjaro)
            print_info "Installing packages for Arch/Manjaro..."
            pacman -Syu --noconfirm \
                python \
                python-pip \
                nodejs \
                npm \
                git \
                networkmanager \
                iproute2 \
                iputils \
                sqlite \
                base-devel
            print_success "System packages installed"
            ;;
        
        *)
            print_warning "Unknown OS: $OS"
            print_warning "Please install dependencies manually:"
            print_info "  - Python 3.8+"
            print_info "  - Node.js 16+"
            print_info "  - Git"
            print_info "  - NetworkManager"
            print_info "  - SQLite3"
            ;;
    esac
}

################################################################################
# Python Backend Setup
################################################################################

setup_backend() {
    print_header "Setting Up Python Backend"
    
    cd "$BACKEND_DIR"
    
    # Create virtual environment
    if [ ! -d "$VENV_DIR" ]; then
        print_info "Creating Python virtual environment..."
        python3 -m venv "$VENV_DIR"
        print_success "Virtual environment created"
    else
        print_info "Virtual environment already exists"
    fi
    
    # Activate virtual environment
    source "$VENV_DIR/bin/activate"
    
    # Upgrade pip
    print_info "Upgrading pip..."
    pip install --upgrade pip
    
    # Install Python dependencies
    print_info "Installing Python dependencies..."
    pip install -r requirements.txt
    print_success "Python dependencies installed"
    
    # Add GitPython for auto-update feature
    print_info "Installing GitPython for auto-update..."
    pip install gitpython
    print_success "GitPython installed"
    
    # Run database migrations
    print_info "Running database migrations..."
    cd "$APP_DIR"
    
    if [ -f "migrate_db.py" ]; then
        python migrate_db.py
        print_success "Main database migration completed"
    fi
    
    if [ -f "migrate_buffering.py" ]; then
        python migrate_buffering.py
        print_success "Buffering database migration completed"
    fi
    
    # Create buffer directory
    if [ "$PRODUCTION" = true ]; then
        print_info "Creating production buffer directory..."
        mkdir -p "$BUFFER_DIR"
        chown -R $SUDO_USER:$SUDO_USER "$BUFFER_DIR"
        print_success "Buffer directory created: $BUFFER_DIR"
    else
        print_info "Creating development buffer directory..."
        mkdir -p "$BACKEND_DIR/buffered_data"
        print_success "Buffer directory created: $BACKEND_DIR/buffered_data"
    fi
    
    deactivate
}

################################################################################
# Node.js Frontend Setup
################################################################################

setup_frontend() {
    print_header "Setting Up Node.js Frontend"
    
    cd "$FRONTEND_DIR"
    
    # Check Node.js version
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 16 ]; then
        print_warning "Node.js version is $NODE_VERSION, recommended version is 16+"
    else
        print_success "Node.js version: $(node -v)"
    fi
    
    # Install npm dependencies
    print_info "Installing npm dependencies..."
    npm install
    print_success "npm dependencies installed"
    
    # Build frontend for production
    if [ "$PRODUCTION" = true ]; then
        print_info "Building frontend for production..."
        npm run build
        print_success "Frontend built successfully"
    fi
}

################################################################################
# Production Setup
################################################################################

setup_production() {
    print_header "Setting Up Production Environment"
    
    if [ "$EUID" -ne 0 ]; then
        print_error "Production setup requires root privileges"
        exit 1
    fi
    
    # Create systemd service file
    print_info "Creating systemd service..."
    
    cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=VistaIOT Gateway Service
After=network.target

[Service]
Type=simple
User=$SUDO_USER
WorkingDirectory=$BACKEND_DIR
Environment="PATH=$VENV_DIR/bin"
ExecStart=$VENV_DIR/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    print_success "Systemd service created"
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable service
    print_info "Enabling service to start on boot..."
    systemctl enable "$SERVICE_NAME"
    print_success "Service enabled"
    
    # Start service
    print_info "Starting service..."
    systemctl start "$SERVICE_NAME"
    print_success "Service started"
    
    # Show status
    systemctl status "$SERVICE_NAME" --no-pager
}

################################################################################
# Verification
################################################################################

verify_installation() {
    print_header "Verifying Installation"
    
    # Check Python
    check_command python3
    
    # Check Node.js
    check_command node
    check_command npm
    
    # Check Git
    check_command git
    
    # Check virtual environment
    if [ -d "$VENV_DIR" ]; then
        print_success "Python virtual environment exists"
    else
        print_error "Python virtual environment not found"
    fi
    
    # Check database
    if [ -f "$BACKEND_DIR/vistaiot.db" ]; then
        print_success "Database file exists"
    else
        print_warning "Database file not found (will be created on first run)"
    fi
    
    # Check frontend build
    if [ "$PRODUCTION" = true ]; then
        if [ -d "$FRONTEND_DIR/dist" ]; then
            print_success "Frontend build exists"
        else
            print_error "Frontend build not found"
        fi
    fi
}

################################################################################
# Main Execution
################################################################################

main() {
    clear
    echo -e "${GREEN}"
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║                                                            ║"
    echo "║              VistaIOT Gateway Setup Script                ║"
    echo "║                                                            ║"
    echo "╚════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    print_info "Installation directory: $APP_DIR"
    print_info "Mode: $([ "$PRODUCTION" = true ] && echo "Production" || echo "Development")"
    echo ""
    
    # Install system dependencies
    if [ "$SKIP_SYSTEM" = false ]; then
        install_system_dependencies
    fi
    
    # Setup backend
    setup_backend
    
    # Setup frontend
    setup_frontend
    
    # Production setup
    if [ "$PRODUCTION" = true ]; then
        setup_production
    fi
    
    # Verify installation
    verify_installation
    
    # Print completion message
    print_header "Setup Complete!"
    
    if [ "$PRODUCTION" = true ]; then
        echo -e "${GREEN}Production setup completed successfully!${NC}"
        echo ""
        print_info "Service status: systemctl status $SERVICE_NAME"
        print_info "View logs: journalctl -u $SERVICE_NAME -f"
        print_info "Restart service: sudo systemctl restart $SERVICE_NAME"
        echo ""
        print_info "Backend API: http://localhost:8000"
        print_info "API Documentation: http://localhost:8000/docs"
    else
        echo -e "${GREEN}Development setup completed successfully!${NC}"
        echo ""
        print_info "To start the backend:"
        echo -e "  ${YELLOW}cd backend${NC}"
        echo -e "  ${YELLOW}source venv/bin/activate${NC}"
        echo -e "  ${YELLOW}uvicorn main:app --host 0.0.0.0 --port 8000 --reload${NC}"
        echo ""
        print_info "To start the frontend:"
        echo -e "  ${YELLOW}cd frontend${NC}"
        echo -e "  ${YELLOW}npm run dev${NC}"
        echo ""
        print_info "Backend API: http://localhost:8000"
        print_info "Frontend UI: http://localhost:5173"
        print_info "API Documentation: http://localhost:8000/docs"
    fi
    
    echo ""
    print_success "All done! 🚀"
    echo ""
}

# Run main function
main
