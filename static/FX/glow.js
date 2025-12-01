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
                @keyframes ${animName} {
                    0% {
                        box-shadow: 0 0 ${size * 0.5}px ${color}33;
                    }
                    100% {
                        box-shadow: 0 0 ${size}px ${color};
                    }
                }
                #goalDiv .progress {
                    overflow: visible !important;
                }
                #goalDiv .progress::before {
                    content: "" !important;
                    position: absolute !important;
                    top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important;
                    border-radius: inherit !important;
                    z-index: -1 !important; 
                    animation: ${animName} ${speed}s ease-in-out infinite alternate !important;
                }
                #goalDiv .progress .progress-bar {
                    overflow: hidden !important;
                    border-radius: inherit !important;
                    box-shadow: 0 0 ${size * 0.5}px ${color}80 !important;
                }
            `;
        }
    });
})();