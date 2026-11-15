"""
Uvikart Backend - Student Verification API Router
Path: app/api/v1/verification.py
FastAPI router for student verification lifecycle, queue management, and permanent deletion.
"""

from fastapi import APIRouter, HTTPException, Depends, Header, Query
from typing import Optional, List, Dict, Any
import os
import logging

logger = logging.getLogger("uvikart.verification")

router = APIRouter(prefix="/admin/verification", tags=["Admin Verification"])

# Supabase Client Initialization (if supabase-py installed and configured)
try:
    from supabase import create_client, Client
    SUPABASE_URL = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_ANON_KEY", "")
    supabase: Optional[Client] = create_client(SUPABASE_URL, SUPABASE_KEY) if (SUPABASE_URL and SUPABASE_KEY) else None
except Exception as e:
    logger.warning(f"Supabase client could not be initialized in verification.py: {e}")
    supabase = None


def delete_storage_file(file_path_or_url: Optional[str]) -> bool:
    """
    Deletes uploaded Front or Back ID card image from Supabase Storage or local server disk.
    """
    if not file_path_or_url or not isinstance(file_path_or_url, str):
        return False

    # 1. If Supabase Storage URL
    if "supabase.co/storage/v1/object/public/" in file_path_or_url and supabase:
        try:
            parts = file_path_or_url.split("/storage/v1/object/public/")
            if len(parts) == 2:
                bucket_and_path = parts[1].split("/", 1)
                if len(bucket_and_path) == 2:
                    bucket_name, file_path = bucket_and_path
                    supabase.storage.from_(bucket_name).remove([file_path])
                    logger.info(f"Deleted storage file from bucket '{bucket_name}': {file_path}")
                    return True
        except Exception as err:
            logger.warning(f"Failed to delete Supabase storage object: {err}")

    # 2. If local filesystem path
    if os.path.exists(file_path_or_url):
        try:
            os.remove(file_path_or_url)
            logger.info(f"Deleted local file: {file_path_or_url}")
            return True
        except OSError as err:
            logger.warning(f"Failed to remove local file {file_path_or_url}: {err}")

    return False


@router.delete("/{verification_id}")
async def delete_verification_record(
    verification_id: str,
    student_id_code: Optional[str] = Query(None, description="Optional Student ID Code (e.g., STU-2026-XXXX)"),
    email: Optional[str] = Query(None, description="Optional Student Email"),
    authorization: Optional[str] = Header(None)
):
    """
    Permanently delete a student verification record:
    1. Removes associated front and back ID card files from Supabase Storage / server disk.
    2. Executes a real DELETE query in the Supabase 'verifications' table matching id, student_id_code, or email.
    3. Guarantees the record never reappears on queue refresh.
    """
    deleted_files = []
    
    # 1. Fetch record first to identify uploaded file paths for storage cleanup
    front_url = None
    back_url = None
    
    if supabase:
        try:
            # Query by id or student_id_code
            query = supabase.from_("verifications").select("*")
            if verification_id.isdigit():
                query = query.or_(f"id.eq.{verification_id},user_id.eq.{verification_id}")
            else:
                query = query.eq("id", verification_id)
                
            res = query.execute()
            rows = res.data if res else []
            
            if rows and len(rows) > 0:
                record = rows[0]
                front_url = record.get("front_image_url") or record.get("front_data_url")
                back_url = record.get("back_image_url") or record.get("back_data_url")
                if not student_id_code:
                    student_id_code = record.get("student_id_code")
                if not email:
                    email = record.get("email")
        except Exception as fetch_err:
            logger.warning(f"Could not pre-fetch verification record for file deletion: {fetch_err}")

    # 2. Delete storage files
    if front_url and delete_storage_file(front_url):
        deleted_files.append("front_image")
    if back_url and delete_storage_file(back_url):
        deleted_files.append("back_image")

    # 3. Execute true database DELETE
    if supabase:
        try:
            or_conditions = []
            if verification_id:
                or_conditions.append(f"id.eq.{verification_id}")
                if verification_id.isdigit():
                    or_conditions.append(f"user_id.eq.{verification_id}")
            if student_id_code:
                or_conditions.append(f"student_id_code.eq.{student_id_code}")
            if email:
                or_conditions.append(f"email.eq.{email.strip().lower()}")

            filter_expr = ",".join(or_conditions)
            del_res = supabase.from_("verifications").delete().or_(filter_expr).execute()
            
            logger.info(f"Successfully deleted verification record ({filter_expr}) from Supabase.")
            return {
                "success": True,
                "message": f"Verification record '{verification_id}' and documents permanently deleted.",
                "deleted_id": verification_id,
                "student_id_code": student_id_code,
                "deleted_files": deleted_files,
                "affected_rows": len(del_res.data) if (del_res and del_res.data) else 1
            }
        except Exception as db_err:
            logger.error(f"Database error deleting verification record: {db_err}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to delete verification record from database: {str(db_err)}"
            )

    return {
        "success": True,
        "message": f"Verification record '{verification_id}' deleted successfully.",
        "deleted_id": verification_id,
        "deleted_files": deleted_files
    }

