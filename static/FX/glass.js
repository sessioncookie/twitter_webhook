(function() {
    // 獨立的 Hex 轉 RGB 函數，確保插件不依賴外部環境
    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '255,255,255';
    }

    window.FX_REGISTRY.register({
        id: "fx_glass",
        name: "磨砂玻璃質感",
        enable: false,
        params: [
            { id: "blur", label: "模糊程度 (px)", type: "range", min: 0, max: 20, value: 10 },
            { id: "opacity", label: "玻璃透明度", type: "range", min: 0, max: 100, value: 30 }, // 建議預設值稍微提高
            { id: "border", label: "邊框亮度", type: "range", min: 0, max: 100, value: 30 }
        ],
        /**
         * @param {Object} values - 插件內部的參數 (blur, opacity, border)
         * @param {Object} globalVars - 主程式傳來的全域參數 (包含 trackColor)
         */
        generateCSS: function(values, globalVars) {
            const blur = values.blur;
            const op = values.opacity / 100; 
            const borderOp = values.border / 100;

            // 1. 獲取使用者在主介面設定的 "軌道顏色"，如果沒設定則預設灰色
            const userColorHex = globalVars.trackColor || "#333333";
            
            // 2. 轉換為 RGB 格式 (例如 "255, 0, 0")
            const userColorRgb = hexToRgb(userColorHex);

            return `
                #goalDiv .progress {
                    background-color: rgba(${userColorRgb}, ${op}) !important;
                    
                    backdrop-filter: blur(${blur}px) !important;
                    -webkit-backdrop-filter: blur(${blur}px) !important;
                    
                    border: 1px solid rgba(255, 255, 255, ${borderOp}) !important;
                    
                    box-shadow: 
                        0 4px 6px rgba(0,0,0,0.1),
                        inset 0 0 10px rgba(${userColorRgb}, ${op * 0.5}) !important;
                }
            `;
        }
    });
})();