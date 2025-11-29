(function() {
    window.FX_REGISTRY.register({
        id: "fx_heartbeat",
        name: "心跳跳動",
        enable: false,
        params: [
            { id: "speed", label: "跳動速度(秒)", type: "range", min: 0.3, max: 3, step: 0.1, value: 1 }
        ],
        generateCSS: function(values, globalVars) {
            const anim = `heartbeat_${this.id}`;
            return `
                #goalDiv .progress .progress-bar {
                    animation: ${anim} ${values.speed}s infinite ease-in-out !important;
                }
                @keyframes ${anim} {
                    0%   { transform: scale(1); }
                    30%  { transform: scale(1.1); }
                    60%  { transform: scale(1); }
                    100% { transform: scale(1); }
                }
            `;
        }
    });
})();
