# Project: Environmental Transparency Platform

## Web UI Architecture

### Navigation & Layout
- **Top Nav Bar**: Persistent navigation across the application.
  - **Home**: Navigates back to the Landing Page.
  - **Graph**: Interface to select categories and generate data visualizations.
  - **News**: Feed of news articles correlated with specific legislation.
  - **Search**: Global search feature for finding bills, news, and topics.

### Page Definitions

#### 1. Landing Page
- The main entry point for the user, providing an overview of the platform's purpose.

#### 2. Category Pages
Dedicated views for specific environmental categories.
- **Graph**: Visual analytics specific to the selected category.
- **News (Trending)**: A feed of trending news articles relevant to the category.
- **Search**: Scoped search functionality within the category.

#### 3. POTUS Performance Tracker
A specialized dashboard for tracking executive performance regarding environmental legislation.
- **Bill Status & Quantity (Bar Graph)**: 
  - Visualizes the number of bills and their current status (e.g., signed, vetoed, pending).
- **Performance Metrics (Shaded Base Graph)**: 
  - A visual representation (area chart/heatmap) tracking performance indicators over time.

## Database Schema

### Table: `Bills`
Primary storage for legislative bills. Designed for vector search capabilities.

| Column Name | Type | Constraints | Indexing | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `Id` | `UUID` | `NOT NULL` | **Create Index** | Primary identifier. |
| `Name` | `STRING` | `NOT NULL` | | Official name of the bill. |
| `Short Description` | `STRING` | `NOT NULL` | | Summary text. |
| `Embedding` | `Vector(768)` | `NULLABLE` | | For semantic search. Back-generated via post-insert trigger/process. |
| `Category` | `ENUM` | | **Create Index** | Classification for filtering and analysis. |

### Table: `News_data`
Storage for news articles linked to environmental topics.

| Column Name | Type | Constraints | Indexing | Notes |
| :--- | :--- | :--- | :--- | :--- |
| `Article_id` | `UUID` | `NOT NULL` | | Primary identifier. |
| `Description` | `STRING` | `NOT NULL` | | Article content/summary. |
| `Related_category` | `ENUM` | `NOT NULL` | | Foreign key reference to category logic. |

## Architecture Overview
- **`client/`**: Frontend application (Web UI).
- **`n8n/`**: Workflow automation (likely for data pipelines, news fetching).
- **`serverless/`**: Backend infrastructure (APIs, embedding generation, database interactions).
