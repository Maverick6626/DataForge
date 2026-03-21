/* Shared application state */
const API = 'http://localhost:8000';

const S = {
  sessionId:       null,
  columns:         [],
  dtypes:          {},
  colKinds:        {},   // 'numeric_continuous' | 'numeric_discrete' | 'categorical'
  nRows:           0,
  missing:         {},
  selectedFeatures: new Set(),
  droppedCols:     new Set(),
  modelMode:       'auto',
  selectedModels:  new Set(),
  taskType:        null,
  results:         null,
  bestModel:       null,
  predictModel:    null,
  activeDeploy:    null,
  allSessions:     [],
  charts:          {},
};

const PAGE_TITLES = {
  import:'Import', clean:'Clean', eda:'Explore',
  features:'Features', model:'Models', train:'Train',
  results:'Results', predict:'Predict', deploy:'Deploy',
};

const CLF_MODELS = [
  {name:'Logistic Regression', lib:'sklearn',  tags:['linear']},
  {name:'Decision Tree',       lib:'sklearn',  tags:['tree']},
  {name:'Random Forest',       lib:'sklearn',  tags:['tree','ensemble']},
  {name:'Extra Trees',         lib:'sklearn',  tags:['tree','ensemble']},
  {name:'Gradient Boosting',   lib:'sklearn',  tags:['boost']},
  {name:'AdaBoost',            lib:'sklearn',  tags:['boost']},
  {name:'SVM',                 lib:'sklearn',  tags:['kernel']},
  {name:'K-Nearest Neighbors', lib:'sklearn',  tags:[]},
  {name:'Naive Bayes',         lib:'sklearn',  tags:['linear']},
  {name:'XGBoost',             lib:'xgboost',  tags:['boost','ensemble']},
  {name:'LightGBM',            lib:'lightgbm', tags:['boost','ensemble']},
  {name:'CatBoost',            lib:'catboost', tags:['boost','ensemble']},
];

const REG_MODELS = [
  {name:'Linear Regression',   lib:'sklearn',  tags:['linear']},
  {name:'Ridge',               lib:'sklearn',  tags:['linear']},
  {name:'Lasso',               lib:'sklearn',  tags:['linear']},
  {name:'ElasticNet',          lib:'sklearn',  tags:['linear']},
  {name:'Decision Tree',       lib:'sklearn',  tags:['tree']},
  {name:'Random Forest',       lib:'sklearn',  tags:['tree','ensemble']},
  {name:'Extra Trees',         lib:'sklearn',  tags:['tree','ensemble']},
  {name:'Gradient Boosting',   lib:'sklearn',  tags:['boost']},
  {name:'AdaBoost',            lib:'sklearn',  tags:['boost']},
  {name:'SVM',                 lib:'sklearn',  tags:['kernel']},
  {name:'K-Nearest Neighbors', lib:'sklearn',  tags:[]},
  {name:'XGBoost',             lib:'xgboost',  tags:['boost','ensemble']},
  {name:'LightGBM',            lib:'lightgbm', tags:['boost','ensemble']},
  {name:'CatBoost',            lib:'catboost', tags:['boost','ensemble']},
];
