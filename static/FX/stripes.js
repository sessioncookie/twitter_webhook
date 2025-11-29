(function() {
    window.FX_REGISTRY.register({
        id: "fx_stripes",
        name: "斜紋效果",
        enable: false,

        params: [
            { id: "enableStripes", label: "啟用斜紋覆蓋", type: "checkbox", value: true }
        ],

        generateCSS: function(values, globalVars) {
            if (!values.enableStripes) return "";

            return `
                #goalDiv .progress .progress-bar::before {
                    content: "";
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    background-image: linear-gradient(
                        45deg,
                        rgba(255,255,255,0.10) 25%,
                        transparent 25%,
                        transparent 50%,
                        rgba(255,255,255,0.10) 50%,
                        rgba(255,255,255,0.10) 75%,
                        transparent 75%,
                        transparent
                    );
                    background-size: 40px 40px;
                }
            `;
        }
    });
})();
