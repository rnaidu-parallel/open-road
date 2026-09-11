"""Crop USGS/Mapzen Cascade Range elevation into a small little-endian height grid."""
import array
import gzip
import math
import pathlib
import struct

root=pathlib.Path(__file__).resolve().parents[1]
raw=gzip.decompress((root/'.source-assets/rainier.hgt.gz').read_bytes())
size=math.isqrt(len(raw)//2)
# Eastern Cascade ridges, excluding Mount Rainier's volcanic cone.
lat_north,lat_south=46.91,46.69
lon_west,lon_east=-121.69,-121.39
out=[]
for row in range(256):
 lat=lat_north+(lat_south-lat_north)*row/255
 y=round((47-lat)*(size-1))
 for col in range(256):
  lon=lon_west+(lon_east-lon_west)*col/255
  x=round((lon+122)*(size-1))
  out.append(max(0,struct.unpack_from('>h',raw,2*(y*size+x))[0]))
(root/'public/assets/mountain-height.bin').write_bytes(struct.pack('<'+'H'*len(out),*out))
print(f'{len(out)} elevations; range {min(out)}–{max(out)} m')
