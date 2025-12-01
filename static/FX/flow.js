// 檔案位置: static/fx/original_flow.js

(function() {
    // 這裡是你原本那組複雜漂亮的漸層
    const originalComplexGradient = `linear-gradient(
        120deg,
        rgba(255,255,255,0.0) 0%,
        rgba(255,255,255,0.04) 15%,
        rgba(255,255,255,0.12) 30%,
        rgba(255,255,255,0.25) 40%,
        rgba(255,255,255,0.95) 50%,
        rgba(255,255,255,0.25) 60%,
        rgba(255,255,255,0.12) 70%,
        rgba(255,255,255,0.04) 85%,
        rgba(255,255,255,0.0) 100%
    )`;

    // 向主程式註冊這個特效
    window.FX_REGISTRY.register({
        id: "fx_original_flow", // 唯一識別碼
        name: "原版流光動畫",    // 在 UI 上顯示的名稱
        enable: false,           // 預設開啟狀態

        // 定義參數 (這裡對應你原本的 fxFlowSpeed)
        params: [
            { id: "speed", label: "流動速度 (秒)", type: "range", min: 0.5, max: 10, step: 0.1, value: 2.5 }
        ],

        // 核心：生成 CSS 的函數
        // values 物件包含了當前 UI 上設定的參數值 (例如 values.speed)
        generateCSS: function(values, globalVars) {
            const speed = values.speed || 2.5;

            // 返回原本的 CSS 邏輯，套用在 ::after 偽元素上
            // 為了避免動畫名稱衝突，這裡將 keyframes 改名為 flowShimmerOriginal
            return `
                #goalDiv .progress .progress-bar::after {
                    content: "" !important;
                    position: absolute !important;
                    top: 0 !important;
                    left: -30% !important;
                    width: 30% !important;
                    height: 100% !important;
                    background: ${originalComplexGradient} !important;
                    animation: flowShimmerOriginal ${speed}s linear infinite !important;
                    z-index: 999 !important;
                    pointer-events: none !important;
                }

                @keyframes flowShimmerOriginal {
                    0%   { transform: translateX(0%); }
                    100% { transform: translateX(400%); }
                }
            `;
        }
    });
})();