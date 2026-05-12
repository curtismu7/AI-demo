"""Secure storage implementation with encryption for sensitive data."""

import os
import json
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any
from datetime import datetime, timezone

from security.encryption import EncryptionManager, EncryptionError


# HI-08: O_NOFOLLOW defeats a symlink TOCTOU attack on ./.storage/{key}.enc.
# Without it, a symlink planted at the target path could redirect the
# write to a privileged file (briefly 0644 before the chmod) or redirect
# the read to a file the process shouldn't be reading. Wrap into helpers
# so both store() and retrieve() use the same hardened open semantics.
def _safe_open_for_write(path: Path) -> int:
    """Open `path` for write with O_NOFOLLOW + 0600 perms atomically.

    Returns an OS fd. Caller is responsible for closing (or wrapping in
    os.fdopen which handles close on context exit).
    """
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW
    return os.open(str(path), flags, 0o600)


def _safe_open_for_read(path: Path) -> int:
    """Open `path` for read with O_NOFOLLOW. Refuses to follow symlinks."""
    flags = os.O_RDONLY | os.O_NOFOLLOW
    return os.open(str(path), flags)


class SecureStorageError(Exception):
    """Exception raised for secure storage operations."""
    pass


class SecureStorage:
    """Secure storage class with encrypted persistence for sensitive data."""
    
    def __init__(self, storage_path: Optional[str] = None, encryption_manager: Optional[EncryptionManager] = None):
        """
        Initialize secure storage.
        
        Args:
            storage_path: Path to storage directory. Defaults to ./.storage
            encryption_manager: Optional encryption manager. Creates new one if not provided.
        """
        self.storage_path = Path(storage_path or "./.storage")
        self.storage_path.mkdir(exist_ok=True, mode=0o700)  # Secure directory permissions
        
        self.encryption_manager = encryption_manager or EncryptionManager()
        self._lock = asyncio.Lock()
    
    async def store(self, key: str, data: Dict[str, Any]) -> None:
        """
        Store encrypted data with metadata.
        
        Args:
            key: Storage key identifier
            data: Data to store
            
        Raises:
            SecureStorageError: If storage operation fails
        """
        async with self._lock:
            try:
                # Add metadata
                storage_data = {
                    "data": data,
                    "stored_at": datetime.now(timezone.utc).isoformat(),
                    "version": "1.0"
                }
                
                # Encrypt the data
                encrypted_data = self.encryption_manager.encrypt_dict(storage_data)
                
                # Write to file. HI-08: O_NOFOLLOW + 0600 atomically — a
                # symlink at this path is rejected; perms are set on the fd
                # at open time so there is no 0644 window before chmod.
                file_path = self._get_file_path(key)
                fd = _safe_open_for_write(file_path)
                try:
                    with os.fdopen(fd, 'w', encoding='utf-8') as f:
                        f.write(encrypted_data)
                except Exception:
                    # If os.fdopen failed, fd may still be open — close it.
                    try:
                        os.close(fd)
                    except OSError:
                        pass
                    raise

            except Exception as e:
                raise SecureStorageError(f"Failed to store data for key '{key}': {e}")
    
    async def retrieve(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve and decrypt stored data.
        
        Args:
            key: Storage key identifier
            
        Returns:
            Decrypted data or None if not found
            
        Raises:
            SecureStorageError: If retrieval operation fails
        """
        async with self._lock:
            try:
                file_path = self._get_file_path(key)
                
                if not file_path.exists():
                    return None
                
                # Read encrypted data. HI-08: O_NOFOLLOW refuses to follow
                # a symlink that may have been planted at the target path.
                fd = _safe_open_for_read(file_path)
                try:
                    with os.fdopen(fd, 'r', encoding='utf-8') as f:
                        encrypted_data = f.read().strip()
                except Exception:
                    try:
                        os.close(fd)
                    except OSError:
                        pass
                    raise
                
                if not encrypted_data:
                    return None
                
                # Decrypt the data
                storage_data = self.encryption_manager.decrypt_dict(encrypted_data)
                
                # Return the actual data (without metadata)
                return storage_data.get("data")
                
            except EncryptionError:
                # Re-raise encryption errors as-is
                raise
            except Exception as e:
                raise SecureStorageError(f"Failed to retrieve data for key '{key}': {e}")
    
    async def delete(self, key: str) -> bool:
        """
        Delete stored data.
        
        Args:
            key: Storage key identifier
            
        Returns:
            True if data was deleted, False if key didn't exist
            
        Raises:
            SecureStorageError: If deletion operation fails
        """
        async with self._lock:
            try:
                file_path = self._get_file_path(key)
                
                if not file_path.exists():
                    return False
                
                file_path.unlink()
                return True
                
            except Exception as e:
                raise SecureStorageError(f"Failed to delete data for key '{key}': {e}")
    
    async def exists(self, key: str) -> bool:
        """
        Check if a key exists in storage.
        
        Args:
            key: Storage key identifier
            
        Returns:
            True if key exists, False otherwise
        """
        file_path = self._get_file_path(key)
        return file_path.exists()
    
    async def list_keys(self) -> list[str]:
        """
        List all stored keys.
        
        Returns:
            List of storage keys
        """
        try:
            keys = []
            for file_path in self.storage_path.glob("*.enc"):
                # Remove .enc extension to get the key
                key = file_path.stem
                keys.append(key)
            return keys
        except Exception as e:
            raise SecureStorageError(f"Failed to list keys: {e}")
    
    async def clear_all(self) -> int:
        """
        Clear all stored data.
        
        Returns:
            Number of items deleted
            
        Raises:
            SecureStorageError: If clear operation fails
        """
        async with self._lock:
            try:
                count = 0
                for file_path in self.storage_path.glob("*.enc"):
                    file_path.unlink()
                    count += 1
                return count
            except Exception as e:
                raise SecureStorageError(f"Failed to clear storage: {e}")
    
    def _get_file_path(self, key: str) -> Path:
        """Get the file path for a storage key."""
        # Sanitize key to prevent directory traversal
        safe_key = "".join(c for c in key if c.isalnum() or c in "._-")
        if not safe_key or safe_key != key:
            raise SecureStorageError(f"Invalid storage key: '{key}'. Keys must contain only alphanumeric characters, dots, underscores, and hyphens.")
        
        return self.storage_path / f"{safe_key}.enc"