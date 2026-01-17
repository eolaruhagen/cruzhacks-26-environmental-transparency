"""
Supabase CSV Parser
Pulls CSV files from Supabase Storage bucket and converts to TOON format.
TOON (Token-Optimized Object Notation) is ~30-60% more token-efficient than JSON.
"""

import os
import csv
import json
import io
from typing import Any
from dotenv import load_dotenv
from supabase import create_client, Client
from toon_llm import encode as toon_encode

# Load environment variables
load_dotenv()


def get_supabase_client() -> Client:
    """
    Initialize and return a Supabase client.
    
    Required env vars:
        - SUPABASE_URL: Your Supabase project URL
        - SUPABASE_KEY: Your Supabase API key (anon or service role)
    """
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        raise ValueError(
            "Missing Supabase credentials. "
            "Ensure SUPABASE_URL and SUPABASE_KEY are set in your .env file."
        )
    
    return create_client(url, key)


def download_csv_from_bucket(
    client: Client,
    bucket_name: str,
    file_path: str
) -> bytes:
    """
    Download a file from Supabase Storage bucket.
    
    Args:
        client: Supabase client instance
        bucket_name: Name of the storage bucket
        file_path: Path to the file within the bucket
        
    Returns:
        Raw bytes content of the file
    """
    response = client.storage.from_(bucket_name).download(file_path)
    return response


def csv_bytes_to_rows(
    csv_bytes: bytes,
    encoding: str = "utf-8",
    auto_convert_types: bool = True
) -> list[dict[str, Any]]:
    """
    Convert CSV bytes to a list of dictionaries.
    Each row becomes an object with column headers as keys.
    
    Args:
        csv_bytes: Raw CSV content as bytes
        encoding: Character encoding of the CSV (default: utf-8)
        auto_convert_types: Attempt to convert strings to int/float/bool/null
        
    Returns:
        List of dictionaries, where each dict represents a row
    """
    csv_string = csv_bytes.decode(encoding)
    csv_file = io.StringIO(csv_string)
    reader = csv.DictReader(csv_file)
    
    rows = []
    for row in reader:
        cleaned_row = {}
        for key, value in row.items():
            clean_key = key.strip()
            clean_value = value.strip() if isinstance(value, str) else value
            
            if auto_convert_types:
                clean_value = _infer_type(clean_value)
            
            cleaned_row[clean_key] = clean_value
        rows.append(cleaned_row)
    
    return rows


def _infer_type(value: str) -> Any:
    """
    Attempt to infer and convert string value to appropriate type.
    Converts: int, float, bool, null/None
    """
    if value is None or value == "":
        return None
    
    # Check for null-like values
    if value.lower() in ("null", "none", "nil"):
        return None
    
    # Check for boolean
    if value.lower() in ("true", "yes", "1"):
        return True
    if value.lower() in ("false", "no", "0"):
        return False
    
    # Try integer
    try:
        return int(value)
    except ValueError:
        pass
    
    # Try float
    try:
        return float(value)
    except ValueError:
        pass
    
    # Return as string
    return value


def rows_to_toon(
    rows: list[dict[str, Any]],
    root_name: str = "records"
) -> str:
    """
    Convert rows to TOON format string.
    TOON uses tabular format for uniform arrays, saving tokens.
    
    Args:
        rows: List of row dictionaries
        root_name: Name for the root collection in TOON output
        
    Returns:
        TOON-formatted string
    """
    data = {root_name: rows}
    return toon_encode(data)


def fetch_kickstart_csv_as_toon(root_name: str = "records") -> str:
    """
    Main function: Fetches the kickstart CSV from Supabase and returns as TOON string.
    
    Required env vars:
        - SUPABASE_URL: Your Supabase project URL
        - SUPABASE_KEY: Your Supabase API key
        - SUPABASE_BUCKET_NAME: Name of the storage bucket
        - KICKSTART_CSV_NAME: Name of the CSV file to fetch
        
    Args:
        root_name: Name for the root collection in TOON output
        
    Returns:
        TOON-formatted string ready for model input
    """
    bucket_name = os.getenv("SUPABASE_BUCKET_NAME")
    csv_filename = os.getenv("KICKSTART_CSV_NAME")
    
    if not bucket_name:
        raise ValueError("SUPABASE_BUCKET_NAME not set in environment.")
    if not csv_filename:
        raise ValueError("KICKSTART_CSV_NAME not set in environment.")
    
    client = get_supabase_client()
    csv_bytes = download_csv_from_bucket(client, bucket_name, csv_filename)
    rows = csv_bytes_to_rows(csv_bytes)
    
    return rows_to_toon(rows, root_name)


def fetch_csv_as_toon(
    bucket_name: str | None = None,
    file_path: str | None = None,
    root_name: str = "records"
) -> str:
    """
    Generic function: Fetches any CSV from Supabase and returns as TOON string.
    Falls back to env vars if parameters not provided.
    
    Args:
        bucket_name: Optional bucket name (falls back to SUPABASE_BUCKET_NAME env var)
        file_path: Optional file path (falls back to KICKSTART_CSV_NAME env var)
        root_name: Name for the root collection in TOON output
        
    Returns:
        TOON-formatted string
    """
    bucket = bucket_name or os.getenv("SUPABASE_BUCKET_NAME")
    file_name = file_path or os.getenv("KICKSTART_CSV_NAME")
    
    if not bucket:
        raise ValueError("Bucket name must be provided or set via SUPABASE_BUCKET_NAME.")
    if not file_name:
        raise ValueError("File path must be provided or set via KICKSTART_CSV_NAME.")
    
    client = get_supabase_client()
    csv_bytes = download_csv_from_bucket(client, bucket, file_name)
    rows = csv_bytes_to_rows(csv_bytes)
    
    return rows_to_toon(rows, root_name)


def fetch_csv_as_rows(
    bucket_name: str | None = None,
    file_path: str | None = None
) -> list[dict[str, Any]]:
    """
    Fetches CSV and returns raw list of dicts (if you need to process before TOON).
    
    Args:
        bucket_name: Optional bucket name
        file_path: Optional file path
        
    Returns:
        List of dictionaries representing CSV rows
    """
    bucket = bucket_name or os.getenv("SUPABASE_BUCKET_NAME")
    file_name = file_path or os.getenv("KICKSTART_CSV_NAME")
    
    if not bucket:
        raise ValueError("Bucket name must be provided or set via SUPABASE_BUCKET_NAME.")
    if not file_name:
        raise ValueError("File path must be provided or set via KICKSTART_CSV_NAME.")
    
    client = get_supabase_client()
    csv_bytes = download_csv_from_bucket(client, bucket, file_name)
    
    return csv_bytes_to_rows(csv_bytes)


# ============================================================================
# JSON fallback functions (if you ever need JSON instead of TOON)
# ============================================================================

def rows_to_json(rows: list[dict[str, Any]], indent: int = 2) -> str:
    """
    Fallback: Serialize rows to JSON string.
    Use TOON instead for better token efficiency.
    """
    return json.dumps(rows, indent=indent, ensure_ascii=False)


def fetch_kickstart_csv_as_json() -> list[dict[str, Any]]:
    """
    Fallback: Fetches CSV and returns as list of dicts (JSON-serializable).
    """
    return fetch_csv_as_rows()


# CLI usage for testing
if __name__ == "__main__":
    try:
        # Fetch as TOON (token-efficient)
        toon_data = fetch_kickstart_csv_as_toon(root_name="bills")
        
        # Also fetch as rows for comparison
        rows = fetch_csv_as_rows()
        json_data = rows_to_json(rows)
        
        print(f"Successfully fetched {len(rows)} rows.\n")
        
        print("=" * 60)
        print("TOON FORMAT (token-efficient):")
        print("=" * 60)
        print(toon_data)
        
        print("\n" + "=" * 60)
        print("JSON FORMAT (for comparison):")
        print("=" * 60)
        print(json_data)
        
        # Token savings estimate
        toon_len = len(toon_data)
        json_len = len(json_data)
        savings = ((json_len - toon_len) / json_len) * 100
        print(f"\n📊 Token savings: ~{savings:.1f}% fewer characters with TOON")
        
    except Exception as e:
        print(f"Error: {e}")
