from pathlib import Path
import base64
import re

project = Path(__file__).resolve().parents[1]
workspace = project.parent
icon = 'data:image/svg+xml;base64,' + base64.b64encode((project / 'public/favicon.svg').read_bytes()).decode()
archive_image = 'data:image/png;base64,' + base64.b64encode((project / 'public/previous-films.png').read_bytes()).decode()
html = (project / 'dist/index.html').read_text()
css = next((project / 'dist/assets').glob('*.css')).read_text()
script = next((project / 'dist/assets').glob('*.js')).read_text().replace('./favicon.svg', icon).replace('./previous-films.png', archive_image)
html = re.sub(r'<script type="module" crossorigin src="[^\"]+"></script>', lambda _: '<script type="module">' + script.replace('</script', '<\\/script') + '</script>', html)
html = re.sub(r'<link rel="stylesheet" crossorigin href="[^\"]+">', lambda _: '<style>' + css + '</style>', html)
html = html.replace('href="./favicon.svg"', 'href="' + icon + '"')
(project / 'frontend-preview.html').write_text(html)
(workspace / 'kuznetsky-okrug-front.html').write_text(html)

def source(name):
    value = (project / 'src' / name).read_text()
    value = re.sub(r'^import .*;\n', '', value, flags=re.M)
    return re.sub(r'^export ', '', value, flags=re.M)

demo_api = 'const configured=true,demoMode=true,db=demoClient;\n' + source('api.js').split('async function query', 1)[1]
demo_api = demo_api.replace('const configured=true,demoMode=true,db=demoClient;\n', 'const configured=true,demoMode=true,db=demoClient;\nasync function query', 1)
script = '\n'.join([source('demo.js'), demo_api, source('project.js'), source('main.js')])
script = script.replace('import.meta.env.BASE_URL', "'./'").replace("${'./'}favicon.svg", icon).replace("${'./'}previous-films.png", archive_image)
script = script.replace('document.querySelector(', 'previewRoot.querySelector(').replace('document.querySelectorAll(', 'previewRoot.querySelectorAll(')
css = (project / 'src/styles.css').read_text().replace(':root{', '#kuznetsky-front{').replace('body{margin:0}', '#kuznetsky-front{margin:0}').replace('min-height:55vh', 'min-height:0').replace('min-height:50vh', 'min-height:0')
extra = '''#kuznetsky-front{background:#121412;border-radius:10px;padding:0 0 1px;color:#eeeee8}#kuznetsky-front .shell{padding:0 26px}#kuznetsky-front .header{flex-wrap:wrap;padding:20px 0;gap:18px}#kuznetsky-front .nav{order:3;width:100%;justify-content:space-between;flex-wrap:wrap}#kuznetsky-front .nav a.active:after{bottom:-10px}#kuznetsky-front #toast{position:relative;bottom:auto;left:auto;transform:none;margin:15px 26px}#kuznetsky-front .footer{margin-top:35px}'''
fragment = '<div id="kuznetsky-front"><div id="app"></div><div id="toast" role="status" aria-live="polite"></div></div>\n<style>\n' + css + '\n' + extra + '\n</style>\n<script>\n(async()=>{const previewRoot=document.getElementById("kuznetsky-front");\n' + script.replace('</script', '<\\/script') + '\n})();\n</script>\n'
(workspace / 'kuznetsky-front-preview.html').write_text(fragment)
print('Standalone and inline previews updated.')
