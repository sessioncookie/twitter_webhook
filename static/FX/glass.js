(function() {
    window.FX_REGISTRY.register({
        id: "fx_glass",
        name: "磨砂玻璃質感",
        enable: false,
        params: [
            { id: "blur", label: "模糊程度 (px)", type: "range", min: 0, max: 20, value: 10 },
            { id: "opacity", label: "白霧透明度", type: "range", min: 0, max: 100, value: 20 },
            { id: "border", label: "玻璃邊框亮度", type: "range", min: 0, max: 100, value: 30 }
        ],
        generateCSS: function(values, globalVars) {
            const blur = values.blur;
            const op = values.opacity / 100; // 轉為 0.0 ~ 1.0
            const borderOp = values.border / 100;

            return `
                /* 強制覆蓋軌道背景顏色 */
                #goalDiv .progress {
                    /* 背景色改為半透明白色，讓模糊可見 */
                    background-color: rgba(255, 255, 255, ${op}) !important;
                    
                    /* 核心：背景模糊 */
                    backdrop-filter: blur(${blur}px) !important;
                    -webkit-backdrop-filter: blur(${blur}px) !important;
                    
                    /* 玻璃通常會有一個微微發亮的邊框 */
                    border: 1px solid rgba(255, 255, 255, ${borderOp}) !important;
                    
                    /* 加強玻璃的通透感陰影 */
                    box-shadow: 
                        0 4px 6px rgba(0,0,0,0.1),
                        inset 0 0 10px rgba(255,255,255, ${borderOp * 0.5}) !important;
                }
            `;
        }
    });
})();