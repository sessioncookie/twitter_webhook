(function() {
    window.FX_REGISTRY.register({
        id: "fx_glitch",
        name: "故障干擾 (Glitch)",
        enable: false,
        params: [
            { id: "intensity", label: "故障強度", type: "range", min: 1, max: 10, value: 5 }
        ],
        generateCSS: function(values, globalVars) {
            const animName = `glitch_anim_${this.id}`;
            const rgbName = `glitch_rgb_${this.id}`;
            const speed = 2.5; // 故障循環時間

            return `
                /* 1. 主體裁切動畫 */
                #goalDiv .progress .progress-bar {
                    position: relative !important;
                    animation: ${animName} ${speed}s infinite linear alternate-reverse !important;
                }

                /* 2. RGB 色差層 (紅) */
                #goalDiv .progress .progress-bar::before {
                    content: "" !important;
                    position: absolute !important;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: red !important;
                    mix-blend-mode: screen !important; /* 混合模式 */
                    opacity: 0.5 !important;
                    z-index: -1 !important;
                    animation: ${rgbName} ${speed * 0.8}s infinite steps(2) !important;
                    display: block !important;
                }

                /* 3. RGB 色差層 (藍) */
                #goalDiv .progress .progress-bar::after {
                    content: "" !important;
                    position: absolute !important;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: blue !important;
                    mix-blend-mode: screen !important;
                    opacity: 0.5 !important;
                    z-index: -1 !important;
                    animation: ${rgbName} ${speed * 1.1}s infinite steps(2) reverse !important;
                    display: block !important;
                }

                /* 裁切動畫關鍵影格 (隨機生成一些數值) */
                @keyframes ${animName} {
                    0% { clip-path: inset(0 0 0 0); transform: translate(0); }
                    5% { clip-path: inset(10% 0 60% 0); transform: translate(-2px, 1px); }
                    10% { clip-path: inset(80% 0 5% 0); transform: translate(2px, -1px); }
                    15% { clip-path: inset(0 0 0 0); transform: translate(0); }
                    
                    /* 中間休息一段時間，不要一直閃 */
                    60% { clip-path: inset(0 0 0 0); transform: translate(0); }
                    
                    65% { clip-path: inset(40% 0 40% 0); transform: translate(1px, 1px); }
                    70% { clip-path: inset(0 0 0 0); transform: translate(0); }
                    100% { clip-path: inset(0 0 0 0); transform: translate(0); }
                }

                /* RGB 抖動動畫 */
                @keyframes ${rgbName} {
                    0% { transform: translate(0); }
                    20% { transform: translate(-${values.intensity}px, ${values.intensity}px); }
                    40% { transform: translate(-${values.intensity}px, -${values.intensity}px); }
                    60% { transform: translate(${values.intensity}px, ${values.intensity}px); }
                    80% { transform: translate(${values.intensity}px, -${values.intensity}px); }
                    100% { transform: translate(0); }
                }
            `;
        }
    });
})();