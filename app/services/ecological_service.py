import pandas as pd
import numpy as np
from sklearn.linear_model import LinearRegression
from flask import current_app
from app.extensions import db
from app.models.ecological_index import EcologicalIndex
from app.services.base_service import BaseDataService

class EcologicalService(BaseDataService):
    """
    【领域服务】生态指标服务
    继承自 BaseDataService，封装了生态数据的导入、查询与预测逻辑
    """

    def import_data(self):
        """实现父类的导入接口"""
        if EcologicalIndex.query.count() > 0:
            return

        csv_path = current_app.config['CSV_PATH']
        if not self.check_file_exists(csv_path):
            return

        try:
            df = pd.read_csv(csv_path)
            data_list = []
            for _, row in df.iterrows():
                data_list.append(EcologicalIndex(
                    year=int(row['year']),
                    ndvi=float(row['NDVI']),
                    fvc=float(row.get('FVC', 0)),
                    wetness=float(row.get('Wetness', 0))
                ))
            db.session.add_all(data_list)
            db.session.commit()
            print("✅ [EcologicalService] 生态指标导入成功")
        except Exception as e:
            print(f"❌ 生态指标导入失败: {e}")

    def get_trend_data(self):
        """实现父类的查询接口"""
        results = EcologicalIndex.query.order_by(EcologicalIndex.year.asc()).all()
        return {
            'years': [r.year for r in results],
            'series': [
                {'name': 'NDVI', 'type': 'line', 'smooth': True, 'data': [r.ndvi for r in results]},
                {'name': 'FVC', 'type': 'line', 'smooth': True, 'data': [r.fvc for r in results]},
                {'name': 'Wetness', 'type': 'line', 'smooth': True, 'data': [r.wetness for r in results]}
            ]
        }

    def predict_future(self, target_year=2030):
        """
        【特有方法】封装机器学习预测逻辑
        """
        history = EcologicalIndex.query.order_by(EcologicalIndex.year.asc()).all()
        if not history:
            return {"error": "No data"}
            
        X = np.array([r.year for r in history]).reshape(-1, 1)
        predictions = {}
        
        for indicator in ['ndvi', 'fvc', 'wetness']:
            y = np.array([getattr(r, indicator) for r in history])
            model = LinearRegression()
            model.fit(X, y)
            
            pred_val = model.predict([[target_year]])[0]
            slope = model.coef_[0]
            trend_text = "上升 📈" if slope > 0 else "下降 📉"
            
            predictions[indicator.upper()] = {
                'value': round(pred_val, 3),
                'trend': trend_text
            }
            
        return {'target_year': target_year, 'predictions': predictions}