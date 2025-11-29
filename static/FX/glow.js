// 檔案位置: static/fx/glow_pulse.js

(function() {
    window.FX_REGISTRY.register({
        id: "fx_glow_pulse",
        name: "呼吸霓虹光暈",
        enable: false,

        params: [
            { id: "intensity", label: "最大強度", type: "range", min: 10, max: 100, step: 1, value: 30 },
            { id: "speed", label: "呼吸速度 (秒)", type: "range", min: 0.5, max: 5, step: 0.1, value: 2.0 },
            { id: "glowColor", label: "光暈顏色", type: "color", value: "#00eaff" }
        ],

        generateCSS: function(values, globalVars) {
            const size = values.intensity;
            const speed = values.speed;
            const color = values.glowColor; // Hex Color
            const animName = `glowBreath_${this.id}`;

            return `
                /* 定義呼吸動畫 */
                @keyframes ${animName} {
                    0% {
                        /* 弱光狀態 (透明度約 20%) */
                        box-shadow: 0 0 ${size * 0.5}px ${color}33;
                    }
                    100% {
                        /* 強光狀態 (透明度 100%) */
                        box-shadow: 0 0 ${size}px ${color};
                    }
                }

                /* 1. 外層容器設定 */
                #goalDiv .progress {
                    /* 讓光暈可以超出框框顯示出來 */
                    overflow: visible !important;
                    /* 注意：這裡不設定 animation，避免與主程式的 !important 衝突 */
                }

                /* 2. 使用 ::before 偽元素來製作呼吸光暈 (這是關鍵！) */
                #goalDiv .progress::before {
                    content: "" !important;
                    position: absolute !important;
                    top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important;
                    border-radius: inherit !important; /* 跟隨原本的圓角 */
                    z-index: -1 !important; /* 放在軌道後面 */
                    
                    /* 在這裡應用動畫，就不會被鎖住了 */
                    animation: ${animName} ${speed}s ease-in-out infinite alternate !important;
                }

                /* 3. 內部進度條 (因為外層 overflow:visible，這裡要修復內部圓角溢出) */
                #goalDiv .progress .progress-bar {
                    overflow: hidden !important;
                    border-radius: inherit !important;
                    /* 讓內部條也有一點點微光，增加層次感 */
                    box-shadow: 0 0 ${size * 0.5}px ${color}80 !important;
                }
            `;
        }
    });
})();