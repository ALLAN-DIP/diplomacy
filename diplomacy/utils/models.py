from abc import ABC

# MODEL MODULE IMPORTS
from baseline_models.model_code.engine_predict import BaselineAdvice

# MODEL PATHS (TODO: fill in the model paths here)
class ModelPath:
    LOGISTIC_REGRESSION = ''

# MODEL UTILS
class Model(ABC):
    def __init__(self, game_state, requested_province):
        self.game_state = game_state
        self.requested_province = requested_province

    def predict(self, top_k=6):
        """
        Return the predicted distribution of possible orders at current game state
        """
        raise NotImplementedError

class LogisticRegression(Model):
    def predict(self, top_k=6):
        model = BaselineAdvice(ModelPath.LOGISTIC_REGRESSION, self.game_state, self.requested_province)
        return model.predict(top_k)
    
# MODELS
class Models:
    LOGISTIC_REGRESSION = LogisticRegression