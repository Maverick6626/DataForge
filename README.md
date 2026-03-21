# DataForge v3.0

No-code machine learning for regression and classification.
Run locally: FastAPI backend + plain HTML/JS frontend.

---

## Setup (Windows)

### Step 1 — Install Python

Download and install Python 3.11 from:
  https://www.python.org/downloads/release/python-3119/

During installation, check the box that says "Add Python to PATH".

Verify it worked by opening Command Prompt and running:

  python --version

You should see something like: Python 3.11.x


### Step 2 — Open the project folder in Command Prompt

Open Command Prompt (press Win+R, type cmd, press Enter).
Navigate to the folder where you extracted this project:

  cd C:\Users\YourName\Desktop\dataforge


### Step 3 — Create a virtual environment

  python -m venv .venv

This creates an isolated Python environment in a folder called .venv.
Only needs to be done once.


### Step 4 — Activate the virtual environment

  .venv\Scripts\activate.bat

Your prompt will change to show (.venv) at the start.
You need to do this every time you open a new Command Prompt window.


### Step 5 — Install dependencies

  pip install -r backend\requirements.txt

This installs FastAPI, scikit-learn, pandas, numpy, and other required packages.
Only needs to be done once (or after pulling updates).


### Step 6 — Install optional boosting libraries

These are optional. Install whichever ones work for your Python version.
If a command fails, skip it — those models will just be excluded.

  pip install xgboost
  pip install lightgbm
  pip install catboost


### Step 7 — Start the API server

  cd backend
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload

You should see output ending with:
  INFO:     Application startup complete.

Leave this window open while using the app.


### Step 8 — Open the frontend

Open File Explorer, go to the dataforge folder, open the frontend folder,
and double-click index.html. It will open in your browser.

Or run this in a second Command Prompt window:
  start frontend\index.html


---

## Daily Use (after first setup)

Every time you want to use DataForge:

1. Open Command Prompt
2. cd C:\Users\YourName\Desktop\dataforge
3. .venv\Scripts\activate.bat
4. cd backend
5. uvicorn main:app --host 0.0.0.0 --port 8000 --reload
6. Open frontend\index.html in your browser

---

## Automatic Start (optional)

Double-click start.bat in the project folder.
It does all of the above automatically.

---

## Updating Dependencies

If you add packages or pull an update:

  .venv\Scripts\activate.bat
  pip install -r backend\requirements.txt

---

## Project Structure

  dataforge\
  |-- frontend\
  |   |-- index.html          Main app (9 pages)
  |   |-- css\
  |   |   `-- style.css
  |   `-- js\
  |       |-- state.js        Shared state and model lists
  |       |-- utils.js        Helpers: toast, nav, charts, sessions
  |       |-- import.js       Page 1 - Upload / paste / sample data
  |       |-- eda.js          Page 3 - EDA, risks, column drill, compare
  |       |-- pipeline.js     Pages 2,4,5,6 - Clean, Features, Models, Train
  |       |-- results.js      Pages 7,8 - Results and Predict
  |       `-- deploy.js       Page 9 - Named deployments
  |-- backend\
  |   |-- main.py             API entry point
  |   |-- requirements.txt    Python dependencies
  |   |-- core\
  |   |   |-- config.py       Session store
  |   |   |-- data.py         EDA, profiling, risk detection, task detection
  |   |   `-- models.py       Model registry, preprocessing, metrics
  |   `-- routers\
  |       |-- data.py         /upload /sample /clean /eda endpoints
  |       |-- train.py        /train/stream (live streaming)
  |       `-- predict.py      /predict /download /deploy endpoints
  |-- start.bat               Automatic launcher
  `-- README.md

---

## Workflow (9 Steps)

  1  Import    Upload a CSV file, paste data, or load a sample dataset
  2  Clean     Impute missing values, remove outliers, drop bad columns
  3  Explore   EDA with 5 tabs: overview, risks, column inspector, comparison, correlations
  4  Features  Pick target column and input features, configure scaling and encoding
  5  Models    AutoSelect all models, or manually choose which ones to train
  6  Train     Watch training happen live in a streaming console
  7  Results   Compare all models, see feature importance, download best model
  8  Predict   Manual input or batch CSV prediction using any trained model
  9  Deploy    Save named deployments with custom titles and prediction forms

---

## Models Available

Classification (9 sklearn + 3 optional):
  Logistic Regression, Decision Tree, Random Forest, Extra Trees,
  Gradient Boosting, AdaBoost, SVM, K-Nearest Neighbors, Naive Bayes,
  XGBoost*, LightGBM*, CatBoost*

Regression (11 sklearn + 3 optional):
  Linear Regression, Ridge, Lasso, ElasticNet,
  Decision Tree, Random Forest, Extra Trees, Gradient Boosting,
  AdaBoost, SVM, K-Nearest Neighbors,
  XGBoost*, LightGBM*, CatBoost*

* Requires optional install step above.

---

## API Endpoints

  GET  /health                             Check API is running, see library versions
  GET  /sessions                           List all loaded datasets in this session
  POST /upload                             Upload a CSV file
  POST /sample/{name}                      Load a built-in dataset (iris/diabetes/california/wine)
  POST /clean                              Apply the cleaning pipeline
  POST /eda                                Get overview stats, risks, correlations
  POST /eda/column                         Get detailed profile of one column
  POST /eda/compare                        Compare two columns
  POST /train/stream                       Train models (streams live log output)
  POST /predict                            Run a single prediction
  POST /predict/batch                      Run predictions on a CSV file
  GET  /model/download/{session_id}        Download the trained model as a .joblib file
  POST /deploy                             Create a named deployment
  GET  /deploy/{session_id}                List deployments for a session
  POST /deploy/{session_id}/{name}/predict Predict using a named deployment

Interactive API docs (when server is running):
  http://localhost:8000/docs

---

## Requirements

  Python 3.8 or higher (3.11 recommended)
  Windows 10 or Windows 11
  Any modern browser: Chrome, Edge, Firefox
