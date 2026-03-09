from abc import ABC, abstractmethod
import os

class BaseDataService(ABC):
    """
    【抽象基类】定义数据服务的标准接口
    体现继承思想：所有具体业务服务都必须继承此类
    """

    @abstractmethod
    def import_data(self):
        """抽象方法：导入数据 (子类必须实现具体逻辑)"""
        pass

    @abstractmethod
    def get_trend_data(self):
        """抽象方法：获取趋势数据 (子类必须实现具体逻辑)"""
        pass

    def check_file_exists(self, filepath):
        """
        【通用方法】检查文件是否存在
        体现封装思想：父类处理通用逻辑，子类直接复用
        """
        if not os.path.exists(filepath):
            print(f"❌ [BaseService] 文件不存在: {filepath}")
            return False
        return True