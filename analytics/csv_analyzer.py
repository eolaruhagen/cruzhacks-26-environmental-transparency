#!/usr/bin/env python3
"""
CSV Data Analyzer
Analyzes the all_bills.csv file to identify:
- Which columns have reliable/complete data
- Which columns have missing data and how much
- Data type inference for DB schema planning
"""

import csv
import sys
from pathlib import Path
from collections import defaultdict
from typing import Any


# Columns to ignore in main analysis (expanded horizontally)
IGNORE_PATTERNS = ["Cosponsor"]  # billSubjectTerm now has useful data!

# ANSI colors for terminal output
class Colors:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    CYAN = "\033[96m"
    BOLD = "\033[1m"
    END = "\033[0m"


def should_ignore_column(col_name: str) -> bool:
    """Check if column should be ignored based on patterns."""
    return any(pattern in col_name for pattern in IGNORE_PATTERNS)


def infer_type(value: str) -> str:
    """Infer the data type of a value."""
    if not value or value.strip() == "":
        return "empty"
    
    value = value.strip()
    
    # Check for URL
    if value.startswith("http://") or value.startswith("https://"):
        return "url"
    
    # Check for date patterns (MM/DD/YYYY or YYYY-MM-DD)
    if "/" in value and len(value) == 10:
        parts = value.split("/")
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            return "date"
    
    # Check for integer
    try:
        int(value)
        return "integer"
    except ValueError:
        pass
    
    # Check for float
    try:
        float(value)
        return "float"
    except ValueError:
        pass
    
    # Default to string
    return "string"


def analyze_csv(filepath: str) -> dict[str, Any]:
    """Analyze CSV file and return statistics."""
    
    with open(filepath, "r", encoding="utf-8") as f:
        # Skip metadata rows (first 3 rows based on inspection)
        for _ in range(3):
            next(f)
        
        # Read headers manually to track column indices
        header_line = next(f)
        all_headers = list(csv.reader([header_line]))[0]
        
        # Find indices of billSubjectTerm and Cosponsor columns
        subject_term_indices = [i for i, h in enumerate(all_headers) if h == "billSubjectTerm"]
        cosponsor_indices = [i for i, h in enumerate(all_headers) if h == "Cosponsor"]
        
        # Get unique headers for main analysis (excluding repeated columns)
        seen = set()
        relevant_headers = []
        for h in all_headers:
            if h not in seen and h != "billSubjectTerm" and not should_ignore_column(h):
                seen.add(h)
                relevant_headers.append(h)
        
        # Initialize counters
        stats = {
            col: {
                "total": 0,
                "filled": 0,
                "empty": 0,
                "types": defaultdict(int),
                "sample_values": [],
            }
            for col in relevant_headers
        }
        
        # Track billSubjectTerms separately
        subject_term_counts: dict[str, int] = defaultdict(int)
        bills_with_subject_terms = 0
        
        # Track cosponsor stats
        total_cosponsors = 0
        bills_with_cosponsors = 0
        
        total_rows = 0
        
        reader = csv.reader(f)
        for row_values in reader:
            total_rows += 1
            
            # Extract subject terms from their specific columns
            row_subject_terms = []
            for idx in subject_term_indices:
                if idx < len(row_values) and row_values[idx] and row_values[idx].strip():
                    term = row_values[idx].strip()
                    row_subject_terms.append(term)
                    subject_term_counts[term] += 1
            
            if row_subject_terms:
                bills_with_subject_terms += 1
            
            # Extract cosponsor count
            row_cosponsors = 0
            for idx in cosponsor_indices:
                if idx < len(row_values) and row_values[idx] and row_values[idx].strip():
                    row_cosponsors += 1
            
            if row_cosponsors > 0:
                bills_with_cosponsors += 1
                total_cosponsors += row_cosponsors
            
            # Create a dict for this row using unique headers
            row_dict = {}
            for i, h in enumerate(all_headers):
                if h in relevant_headers and h not in row_dict:
                    row_dict[h] = row_values[i] if i < len(row_values) else ""
            
            for col in relevant_headers:
                value = row_dict.get(col, "")
                stats[col]["total"] += 1
                
                if value and value.strip():
                    stats[col]["filled"] += 1
                    dtype = infer_type(value)
                    stats[col]["types"][dtype] += 1
                    
                    # Store sample values (max 3)
                    if len(stats[col]["sample_values"]) < 3:
                        # Truncate long values
                        sample = value[:80] + "..." if len(value) > 80 else value
                        if sample not in stats[col]["sample_values"]:
                            stats[col]["sample_values"].append(sample)
                else:
                    stats[col]["empty"] += 1
                    stats[col]["types"]["empty"] += 1
    
    return {
        "total_rows": total_rows,
        "columns": stats,
        "relevant_headers": relevant_headers,
        "subject_terms": dict(subject_term_counts),
        "bills_with_subject_terms": bills_with_subject_terms,
        "cosponsor_stats": {
            "bills_with_cosponsors": bills_with_cosponsors,
            "total_cosponsors": total_cosponsors,
            "avg_per_bill": total_cosponsors / bills_with_cosponsors if bills_with_cosponsors > 0 else 0,
        }
    }


def print_report(analysis: dict[str, Any]) -> None:
    """Print formatted analysis report."""
    
    total_rows = analysis["total_rows"]
    columns = analysis["columns"]
    
    print(f"\n{Colors.BOLD}{'='*70}")
    print(f"  CSV DATA ANALYSIS REPORT")
    print(f"{'='*70}{Colors.END}\n")
    
    print(f"{Colors.CYAN}Total Rows:{Colors.END} {total_rows:,}")
    print(f"{Colors.CYAN}Analyzed Columns:{Colors.END} {len(columns)} (excluding billSubjectTerm columns)\n")
    
    # Categorize columns by fill rate
    always_filled = []
    mostly_filled = []
    sometimes_filled = []
    rarely_filled = []
    
    for col, stats in columns.items():
        fill_rate = (stats["filled"] / stats["total"]) * 100 if stats["total"] > 0 else 0
        
        if fill_rate == 100:
            always_filled.append((col, stats, fill_rate))
        elif fill_rate >= 90:
            mostly_filled.append((col, stats, fill_rate))
        elif fill_rate >= 50:
            sometimes_filled.append((col, stats, fill_rate))
        else:
            rarely_filled.append((col, stats, fill_rate))
    
    # Print Always Filled (100%) - Safe for NOT NULL
    print(f"\n{Colors.GREEN}{Colors.BOLD}✅ ALWAYS FILLED (100%) - Safe for NOT NULL{Colors.END}")
    print("-" * 70)
    if always_filled:
        for col, stats, fill_rate in always_filled:
            primary_type = max(stats["types"].items(), key=lambda x: x[1] if x[0] != "empty" else 0)[0]
            print(f"  {Colors.GREEN}•{Colors.END} {col}")
            print(f"    Type: {Colors.CYAN}{primary_type}{Colors.END}")
            if stats["sample_values"]:
                print(f"    Sample: {stats['sample_values'][0][:60]}")
    else:
        print("  (none)")
    
    # Print Mostly Filled (90-99%)
    print(f"\n{Colors.YELLOW}{Colors.BOLD}⚠️  MOSTLY FILLED (90-99%) - Consider NULLABLE{Colors.END}")
    print("-" * 70)
    if mostly_filled:
        for col, stats, fill_rate in mostly_filled:
            primary_type = max(stats["types"].items(), key=lambda x: x[1] if x[0] != "empty" else 0)[0]
            print(f"  {Colors.YELLOW}•{Colors.END} {col}")
            print(f"    Fill Rate: {fill_rate:.1f}% ({stats['empty']:,} missing)")
            print(f"    Type: {Colors.CYAN}{primary_type}{Colors.END}")
    else:
        print("  (none)")
    
    # Print Sometimes Filled (50-89%)
    print(f"\n{Colors.YELLOW}{Colors.BOLD}📊 SOMETIMES FILLED (50-89%) - NULLABLE{Colors.END}")
    print("-" * 70)
    if sometimes_filled:
        for col, stats, fill_rate in sometimes_filled:
            primary_type = max(stats["types"].items(), key=lambda x: x[1] if x[0] != "empty" else 0)[0]
            print(f"  {Colors.YELLOW}•{Colors.END} {col}")
            print(f"    Fill Rate: {fill_rate:.1f}% ({stats['empty']:,} missing)")
            print(f"    Type: {Colors.CYAN}{primary_type}{Colors.END}")
    else:
        print("  (none)")
    
    # Print Rarely Filled (<50%)
    print(f"\n{Colors.RED}{Colors.BOLD}❌ RARELY FILLED (<50%) - Optional/NULLABLE{Colors.END}")
    print("-" * 70)
    if rarely_filled:
        for col, stats, fill_rate in rarely_filled:
            primary_type = "N/A"
            non_empty_types = {k: v for k, v in stats["types"].items() if k != "empty"}
            if non_empty_types:
                primary_type = max(non_empty_types.items(), key=lambda x: x[1])[0]
            print(f"  {Colors.RED}•{Colors.END} {col}")
            print(f"    Fill Rate: {fill_rate:.1f}% ({stats['filled']:,} filled, {stats['empty']:,} missing)")
            print(f"    Type: {Colors.CYAN}{primary_type}{Colors.END}")
    else:
        print("  (none)")
    
    # Print Cosponsor Analysis
    cosponsor_stats = analysis.get("cosponsor_stats", {})
    if cosponsor_stats:
        print(f"\n{Colors.CYAN}{Colors.BOLD}👥 COSPONSOR ANALYSIS{Colors.END}")
        print("-" * 70)
        print(f"  Bills with cosponsors: {cosponsor_stats['bills_with_cosponsors']:,} / {total_rows:,} ({cosponsor_stats['bills_with_cosponsors']/total_rows*100:.1f}%)")
        print(f"  Total cosponsors: {cosponsor_stats['total_cosponsors']:,}")
        print(f"  Avg cosponsors per bill: {cosponsor_stats['avg_per_bill']:.1f}")
    
    # Print billSubjectTerm Analysis
    subject_terms = analysis.get("subject_terms", {})
    bills_with_terms = analysis.get("bills_with_subject_terms", 0)
    
    print(f"\n{Colors.CYAN}{Colors.BOLD}🏷️  BILL SUBJECT TERMS ANALYSIS{Colors.END}")
    print("-" * 70)
    print(f"  Bills with subject terms: {bills_with_terms:,} / {total_rows:,} ({bills_with_terms/total_rows*100:.1f}%)")
    print(f"  Unique subject terms: {len(subject_terms):,}")
    
    if subject_terms:
        # Sort by frequency
        sorted_terms = sorted(subject_terms.items(), key=lambda x: x[1], reverse=True)
        print(f"\n  {Colors.BOLD}Top 30 Subject Terms:{Colors.END}")
        for term, count in sorted_terms[:30]:
            bar_len = int((count / sorted_terms[0][1]) * 30)
            bar = "█" * bar_len
            print(f"    {count:>4} {bar} {term}")
        
        if len(sorted_terms) > 30:
            print(f"\n    ... and {len(sorted_terms) - 30} more terms")
    
    # Print DB Schema Recommendation
    print(f"\n{Colors.BOLD}{'='*70}")
    print(f"  RECOMMENDED DB SCHEMA (based on analysis)")
    print(f"{'='*70}{Colors.END}\n")
    
    print("```sql")
    print("CREATE TABLE bills (")
    print("  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),")
    
    for col, stats, fill_rate in always_filled:
        col_name = col.lower().replace(" ", "_").replace("-", "_")
        primary_type = max(stats["types"].items(), key=lambda x: x[1] if x[0] != "empty" else 0)[0]
        sql_type = "TEXT"
        if primary_type == "date":
            sql_type = "DATE"
        elif primary_type == "url":
            sql_type = "TEXT"
        elif primary_type == "integer":
            sql_type = "INTEGER"
        print(f"  {col_name} {sql_type} NOT NULL,")
    
    for col, stats, fill_rate in mostly_filled + sometimes_filled + rarely_filled:
        col_name = col.lower().replace(" ", "_").replace("-", "_")
        non_empty_types = {k: v for k, v in stats["types"].items() if k != "empty"}
        primary_type = max(non_empty_types.items(), key=lambda x: x[1])[0] if non_empty_types else "string"
        sql_type = "TEXT"
        if primary_type == "date":
            sql_type = "DATE"
        elif primary_type == "url":
            sql_type = "TEXT"
        elif primary_type == "integer":
            sql_type = "INTEGER"
        print(f"  {col_name} {sql_type},  -- {fill_rate:.0f}% filled")
    
    print("  created_at TIMESTAMPTZ DEFAULT NOW()")
    print(");")
    print("```")
    
    print(f"\n{Colors.BOLD}{'='*70}{Colors.END}\n")


def main():
    # Default to all_bills.csv in parent directory
    default_path = Path(__file__).parent.parent / "all_bills.csv"
    
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
    elif default_path.exists():
        filepath = str(default_path)
    else:
        print(f"{Colors.RED}Error: No CSV file specified and default not found.{Colors.END}")
        print(f"Usage: python csv_analyzer.py [path/to/file.csv]")
        sys.exit(1)
    
    print(f"\n{Colors.CYAN}Analyzing:{Colors.END} {filepath}")
    print(f"{Colors.CYAN}Please wait...{Colors.END}")
    
    try:
        analysis = analyze_csv(filepath)
        print_report(analysis)
    except FileNotFoundError:
        print(f"{Colors.RED}Error: File not found: {filepath}{Colors.END}")
        sys.exit(1)
    except Exception as e:
        print(f"{Colors.RED}Error: {e}{Colors.END}")
        sys.exit(1)


if __name__ == "__main__":
    main()
