// 导出配置对象
export const CLASS_CONFIG = {
    1: {name: '水体', color: '#3498db'},
    2: {name: '植被', color: '#2ecc71'},
    3: {name: '耕地', color: '#27ae60'},
    4: {name: '城镇', color: '#e74c3c'},
    5: {name: '沙地', color: '#f1c40f'},
    6: {name: '裸地', color: '#95a5a6'}
};

export const CHART_TOOLBOX = {
    feature: {
        dataView: { show: true, readOnly: false, title: '数据视图' },
        magicType: { show: true, type: ['line', 'bar'], title: {line:'切换折线', bar:'切换柱状'} },
        restore: { show: true, title: '还原' },
        saveAsImage: { show: true, title: '保存图片' }
    }
};