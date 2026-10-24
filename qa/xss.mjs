const x = `<img src=x onerror=alert(1)>`;
const r = await fetch('http://127.0.0.1:3055/api/products',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'<img src=x onerror="window.__xss=1">XSS <script>window.__xss=2</script>',description:x,category_id:21,tags:['<b>t</b>'],axes:[{name:'<i>ax</i>',options:['<u>o1</u>','o2']}],variants:[{option_values:['<u>o1</u>'],price:5000,weight_value:1,weight_unit_id:1,sku:'<s>SKU</s>'},{option_values:['o2'],price:5000,weight_value:1,weight_unit_id:1}]})});
console.log(r.status,(await r.json()).id);
