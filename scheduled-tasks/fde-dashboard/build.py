"""Usage: python3 build.py <artifact.html> <standalone.html>
Wraps the artifact page (no doctype/head/body) into a standalone HTML document."""
import sys
content=open(sys.argv[1]).read()
head,body=content.split('</style>',1)
full=('<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
      +head+'</style>\n</head>\n<body>\n'+body+'\n</body>\n</html>\n')
open(sys.argv[2],'w').write(full)
print(f"wrote {sys.argv[2]} {len(full.encode())} bytes")
