# Workflow

## 🔄 The 9-Step Workflow

The platform guides users through a complete end-to-end machine learning pipeline:

### 1. Import
Load your dataset into the session.
* Upload a local CSV file.
* Paste raw comma-separated data directly.
* Load built-in sample datasets (Iris, Diabetes, California Housing, Wine).

### 2. Clean
Handle data imperfections before training.
* **Missing Values:** Apply imputation strategies (mean, median, mode).
* **Outliers:** Detect and remove extreme anomalies.
* **Feature Selection:** Drop columns that contain invalid, redundant, or leaky data.

### 3. Explore (EDA)
Understand your dataset through 5 dedicated tabs:
* **Overview:** General statistics and row/column counts.
* **Risks:** Automated detection of high cardinality, heavy missingness, or class imbalance.
* **Inspector:** Drill down into the distribution of a single specific column.
* **Compare:** Analyze the relationship between two specific columns.
* **Correlations:** View a heatmap of feature correlations.

### 4. Features
Configure how the model interprets your data.
* Select the **Target Column** (what you want to predict).
* Select the **Input Features**.
* Configure feature scaling (e.g., Standard, MinMax) and categorical encoding.

### 5. Models
Select the algorithms to train. You can AutoSelect all applicable models or manually cherry-pick from the available list based on your task (Classification vs. Regression).

### 6. Train
Execute the training loop. A live streaming console displays real-time logs, progress, and errors as each model fits the data.

### 7. Results
Evaluate model performance.
* Compare models side-by-side using metrics like Accuracy, F1-Score, RMSE, or R2.
* View feature importance charts for tree-based models.
* Download the best-performing model as a `.joblib` file.

### 8. Predict
Test the trained models immediately.
* **Manual Input:** Enter values into an auto-generated web form to get a single prediction.
* **Batch Prediction:** Upload a new CSV without the target column to generate bulk predictions.

### 9. Deploy
Save specific configurations for repeated use. Create "Named Deployments" with custom titles to lock in a model and generate a dedicated, clean prediction form.

---

## 🧠 Supported Models

DataForge automatically detects whether your task is Classification or Regression based on your target column.

### Classification (12 Models)
* **Standard (scikit-learn):** Logistic Regression, Decision Tree, Random Forest, Extra Trees, Gradient Boosting, AdaBoost, SVM, K-Nearest Neighbors, Naive Bayes.
* **Advanced (Requires optional pip install):** XGBoost, LightGBM, CatBoost.

### Regression (14 Models)
* **Standard (scikit-learn):** Linear Regression, Ridge, Lasso, ElasticNet, Decision Tree, Random Forest, Extra Trees, Gradient Boosting, AdaBoost, SVM, K-Nearest Neighbors.
* **Advanced (Requires optional pip install):** XGBoost, LightGBM, CatBoost.

---

## 🔌 API Reference

The FastAPI backend exposes the following endpoints. You can interact with them directly or view the interactive Swagger UI at `http://localhost:8000/docs`.

### System & State
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Check if the API is running and view library versions. |
| `GET` | `/sessions` | List all currently loaded dataset sessions. |

### Data & EDA
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/upload` | Upload a new CSV file to create a session. |
| `POST` | `/sample/{name}` | Load a built-in dataset (e.g., `iris`, `wine`). |
| `POST` | `/clean` | Apply the cleaning pipeline to a session. |
| `POST` | `/eda` | Retrieve overview statistics, data risks, and correlations. |
| `POST` | `/eda/column` | Get a detailed statistical profile of a single column. |
| `POST` | `/eda/compare` | Get comparison metrics between two columns. |

### Training & Prediction
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/train/stream` | Initialize model training (Streams live log output). |
| `POST` | `/predict` | Run a single prediction using a trained model. |
| `POST` | `/predict/batch` | Run bulk predictions on an uploaded CSV file. |
| `GET` | `/model/download/{id}`| Download the trained model as a `.joblib` file. |

### Deployment
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/deploy` | Create and save a named deployment. |
| `GET` | `/deploy/{id}` | List all saved deployments for a specific session. |
| `POST` | `/deploy/{id}/{name}/predict` | Run a prediction using a specific named deployment. |