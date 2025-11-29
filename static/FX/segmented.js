(function() {
    window.FX_REGISTRY.register({
        id: "fx_segmented",
        name: "分段塊狀風格",
        enable: false,
        params: [
            { id: "gap", label: "間隙寬度 (px)", type: "range", min: 1, max: 20, value: 4 },
            { id: "width", label: "區塊寬度 (px)", type: "range", min: 5, max: 50, value: 15 },
            { id: "angle", label: "切割角度", type: "range", min: 0, max: 180, value: 110 } // 斜切更帥
        ],
        generateCSS: function(values, globalVars) {
            // 計算總循環長度
            const total = parseInt(values.width) + parseInt(values.gap);
            const w = values.width;
            const deg = values.angle;

            // 使用 mask-image 製作切割效果
            // 黑色(#000)代表顯示，透明(transparent)代表隱藏
            const maskCSS = `repeating-linear-gradient(
                ${deg}deg,
                #000 0px,
                #000 ${w}px,
                transparent ${w}px,
                transparent ${total}px
            )`;

            return `
                #goalDiv .progress .progress-bar {
                    -webkit-mask-image: ${maskCSS} !important;
                    mask-image: ${maskCSS} !important;
                    
                    /* 稍微消除鋸齒邊緣 */
                    -webkit-mask-size: 100% 100% !important;
                }
            `;
        }
    });
})();