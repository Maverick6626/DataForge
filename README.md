# DataForge

No-code machine learning for regression and classification running locally via a FastAPI backend and plain HTML/JS frontend.

## 🚀 Quickstart (Windows)

The easiest way to get started is to use the included batch script, which handles the virtual environment, dependencies, and launching the app automatically:

1. Double-click `start.bat`
2. The API will start, and the frontend will open in your browser.

---

## 🛠️ Manual Setup

If you prefer to run things manually or need to install optional dependencies:

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate.bat

# 2. Install core dependencies
pip install -r backend\requirements.txt

# 3. (Optional) Install boosting libraries
pip install xgboost lightgbm catboost

# 4. Start the backend server
cd backend
uvicorn main:app --host 0.0.0.0 --port 8000 --reload