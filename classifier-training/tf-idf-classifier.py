import json
import string
from typing import Optional, Tuple
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.model_selection import GridSearchCV, StratifiedKFold, train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report

def make_clean_csv() -> pd.DataFrame:
    df = pd.read_csv("classifier-training/MN-DS-news-classification.csv");
    df.drop_duplicates(subset=["url", "title"], inplace=True)
    return df

def strip_punctuation(text: str) -> str:
    return text.translate(str.maketrans("", "", string.punctuation))

def prep_columns(df: pd.DataFrame) -> pd.DataFrame:
    df["binary_class"] = (df["category_level_1"] == "environment").astype(int)
    df["text"] = (df["title"] + " : " + df["content"].str[:200]).apply(strip_punctuation)

def split_feat_label(df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
    return (df["text"], df["binary_class"])

def run_test(model: Pipeline, X_test: pd.Series, y_test: pd.Series):
    predictions = model.predict(X_test)
    print("\nHeld-Out Test Set Results")
    print(classification_report(y_test, predictions, target_names=["not_environment", "environment"]))

def train_with_grid_search(feat: pd.Series, labels: pd.Series):
    final_grid: Optional[GridSearchCV] = None
    for rand_state in [32, 42, 52, 62]:
        X_train, X_test, y_train, y_test = train_test_split(
            feat, labels, test_size=0.2, random_state=rand_state, stratify=labels
        )

        pipe = Pipeline([
            ("tfidf", TfidfVectorizer(stop_words="english")),
            ("lr", LogisticRegression(
                class_weight='balanced', max_iter=10000,
                solver='lbfgs', penalty='l2'
            ))
        ])
        param_grid = {
            'tfidf__max_features': [10000, 12000, 15000],
            'tfidf__ngram_range': [(1,1), (1,2)],
            'lr__C': [1.0, 10.0, 50.0, 100.0],
        }

        cv = StratifiedKFold(n_splits=10, shuffle=True, random_state=42)
        grid = GridSearchCV(
            pipe,
            param_grid,
            cv=cv,
            scoring='recall',
            n_jobs=-1,
            verbose=1
        )

        grid.fit(X_train, y_train)
        print(f"Best Params to use: {grid.best_params_}")
        print(f"Grids Best Score: {grid.best_score_}")
        final_grid = grid

        run_test(grid.best_estimator_, X_test, y_test)

    return final_grid.best_estimator_, X_test, y_test

def export_model_json(model: Pipeline, output_path: str = "classifier-training/model.json"):
    tfidf: TfidfVectorizer = model.named_steps["tfidf"]
    lr: LogisticRegression = model.named_steps["lr"]

    # TF-IDF vocabulary: word -> index mapping
    vocab = {word: int(idx) for word, idx in tfidf.vocabulary_.items()}

    # IDF weights: one per vocab term
    idf = tfidf.idf_

    # LogReg: one weight per vocab term + a bias (intercept)
    # coef_ is shape (1, n_features) for binary classification
    weights = lr.coef_[0]
    intercept = lr.intercept_[0]

    export = {
        "vocab": vocab,
        "idf": idf.tolist(),
        "weights": weights.tolist(),
        "intercept": float(intercept),
    }

    with open(output_path, "w") as f:
        json.dump(export, f)

    # Print some stats about the export
    non_zero = int(np.count_nonzero(weights))
    print(f"\nModel exported to {output_path}")
    print(f"  Vocab size: {len(vocab)}")
    zeroed = len(weights) - non_zero
    print(f"  Non-zero weights: {non_zero} / {len(weights)} ({zeroed} zeroed out)")
    print(f"  File size: {len(json.dumps(export)) / 1024:.0f} KB")

if __name__ == "__main__":
    df = make_clean_csv()
    prep_columns(df)
    (x, y) = split_feat_label(df)
    best_model, X_test, y_test = train_with_grid_search(x,y)
    run_test(best_model, X_test, y_test)
    # Export to new path (preserving original L1 model.json)
    export_model_json(best_model, output_path="classifier-training/model_v2_l2.json")
    # Also overwrite main model.json for production use
    export_model_json(best_model, output_path="classifier-training/model.json")
    