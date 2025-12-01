"""
Auto-Update Service

Handles automatic updates of the VistaIOT Gateway application using Git.
Fetches the latest code from a specified branch and executes setup.sh.
"""

import os
import subprocess
from datetime import datetime
from typing import Dict, Optional, Tuple
from pathlib import Path
import logging

try:
    import git
    from git import Repo
except ImportError:
    git = None
    Repo = None

from sqlalchemy.orm import Session
from ..models.system_settings import SystemSettings


logger = logging.getLogger(__name__)


class AutoUpdateService:
    """
    Service for managing automatic updates via Git.
    
    Features:
    - Check for updates on specified branch
    - Pull latest changes
    - Execute setup.sh with sudo privileges
    - Track update status and history
    """
    
    def __init__(self, repo_path: str = None):
        """
        Initialize the auto-update service.
        
        Args:
            repo_path: Path to the Git repository (defaults to current directory)
        """
        if repo_path is None:
            # Default to the parent directory of backend
            repo_path = Path(__file__).parent.parent.parent.parent
        
        self.repo_path = Path(repo_path)
        self.setup_script = self.repo_path / "setup.sh"
        
        if git is None:
            logger.warning("GitPython not installed. Auto-update functionality disabled.")
            self.repo = None
        else:
            try:
                self.repo = Repo(self.repo_path)
            except git.InvalidGitRepositoryError:
                logger.warning(f"{self.repo_path} is not a Git repository")
                self.repo = None
    
    def is_git_available(self) -> bool:
        """Check if Git is available and repository is valid."""
        return self.repo is not None
    
    def get_current_branch(self) -> Optional[str]:
        """Get the current Git branch name."""
        if not self.is_git_available():
            return None
        
        try:
            return self.repo.active_branch.name
        except Exception as e:
            logger.error(f"Failed to get current branch: {e}")
            return None
    
    def get_current_commit(self) -> Optional[str]:
        """Get the current commit hash."""
        if not self.is_git_available():
            return None
        
        try:
            return self.repo.head.commit.hexsha[:8]
        except Exception as e:
            logger.error(f"Failed to get current commit: {e}")
            return None
    
    def check_for_updates(self, branch: str = "production") -> Tuple[bool, str]:
        """
        Check if updates are available on the specified branch.
        
        Args:
            branch: Branch name to check
            
        Returns:
            Tuple of (has_updates, message)
        """
        if not self.is_git_available():
            return False, "Git not available"
        
        try:
            # Fetch latest changes
            origin = self.repo.remotes.origin
            origin.fetch()
            
            # Get local and remote commits
            local_commit = self.repo.head.commit
            remote_commit = origin.refs[branch].commit
            
            if local_commit.hexsha == remote_commit.hexsha:
                return False, "Already up to date"
            
            # Count commits behind
            commits_behind = list(self.repo.iter_commits(f'{local_commit}..{remote_commit}'))
            count = len(commits_behind)
            
            return True, f"{count} commit(s) available"
            
        except Exception as e:
            logger.error(f"Failed to check for updates: {e}")
            return False, f"Error: {str(e)}"
    
    def perform_update(
        self,
        branch: str = "production",
        db: Session = None
    ) -> Tuple[bool, str]:
        """
        Perform the update: checkout branch, pull changes, run setup.sh.
        
        Args:
            branch: Branch to update to
            db: Database session for updating settings
            
        Returns:
            Tuple of (success, message)
        """
        if not self.is_git_available():
            return False, "Git not available"
        
        update_log = []
        
        try:
            # 1. Fetch latest changes
            update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching updates...")
            origin = self.repo.remotes.origin
            origin.fetch()
            
            # 2. Checkout branch if different
            current_branch = self.get_current_branch()
            if current_branch != branch:
                update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] Switching to branch: {branch}")
                self.repo.git.checkout(branch)
            
            # 3. Pull latest changes
            update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] Pulling latest changes...")
            pull_info = origin.pull(branch)
            
            if pull_info and len(pull_info) > 0:
                update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] Pulled {len(pull_info)} change(s)")
            
            # 4. Execute setup.sh
            if self.setup_script.exists():
                update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] Executing setup.sh...")
                result = self._execute_setup_script()
                
                if result["success"]:
                    update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] Setup completed successfully")
                else:
                    update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] Setup failed: {result['error']}")
                    return False, "\n".join(update_log)
            else:
                update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] Warning: setup.sh not found")
            
            # 5. Update database settings
            if db:
                self._update_settings(db, "success", "\n".join(update_log))
            
            update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] Update completed successfully!")
            return True, "\n".join(update_log)
            
        except Exception as e:
            error_msg = f"Update failed: {str(e)}"
            update_log.append(f"[{datetime.now().strftime('%H:%M:%S')}] {error_msg}")
            
            if db:
                self._update_settings(db, "failed", "\n".join(update_log))
            
            logger.error(error_msg, exc_info=True)
            return False, "\n".join(update_log)
    
    def _execute_setup_script(self) -> Dict:
        """
        Execute setup.sh with appropriate privileges.
        
        Returns:
            Dict with success status and output/error
        """
        try:
            # Check if we need sudo
            needs_sudo = os.geteuid() != 0
            
            if needs_sudo:
                # Execute with sudo
                cmd = ["sudo", str(self.setup_script), "--no-system"]
            else:
                # Already root, execute directly
                cmd = [str(self.setup_script), "--no-system"]
            
            # Run the script
            result = subprocess.run(
                cmd,
                cwd=str(self.repo_path),
                capture_output=True,
                text=True,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode == 0:
                return {
                    "success": True,
                    "output": result.stdout
                }
            else:
                return {
                    "success": False,
                    "error": result.stderr or result.stdout
                }
                
        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "error": "Setup script timed out after 5 minutes"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    def _update_settings(self, db: Session, status: str, log: str):
        """Update system settings with update status."""
        try:
            settings = db.query(SystemSettings).first()
            if settings:
                settings.last_update_check = datetime.utcnow()
                settings.last_update_status = f"{status}: {log[:500]}"  # Limit log size
                db.commit()
        except Exception as e:
            logger.error(f"Failed to update settings: {e}")
    
    def get_repository_info(self) -> Dict:
        """
        Get information about the Git repository.
        
        Returns:
            Dict with repository information
        """
        if not self.is_git_available():
            return {
                "available": False,
                "message": "Git not available or not a repository"
            }
        
        try:
            origin = self.repo.remotes.origin
            
            return {
                "available": True,
                "current_branch": self.get_current_branch(),
                "current_commit": self.get_current_commit(),
                "remote_url": origin.url if origin else None,
                "has_uncommitted_changes": self.repo.is_dirty(),
                "setup_script_exists": self.setup_script.exists()
            }
        except Exception as e:
            return {
                "available": False,
                "message": f"Error: {str(e)}"
            }


# Global auto-update service instance
auto_update_service = AutoUpdateService()
