(function() {
    if (window.location.pathname.includes('/bcf') && !document.getElementById('simple-ifc-panel')) {
        setTimeout(function() {
            var div = document.createElement('div');
            div.id = 'simple-ifc-panel';
            div.style.cssText = 'position:fixed;top:100px;right:20px;width:250px;height:150px;background:white;border:2px solid blue;z-index:9999;padding:10px;font-family:Arial';
            div.innerHTML = '<h3>IFC Panel</h3><p>Funcionando!</p><button onclick="this.parentElement.remove()">Cerrar</button>';
            document.body.appendChild(div);
            console.log('Panel IFC creado');
        }, 1000);
    }
})();
