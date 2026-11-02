#!/usr/bin/env python3
"""Minimal Android binary-XML (AXML) reader, used to inspect a packaged APK manifest
without the Android SDK. Prints the element tree and asserts the game markers."""
import struct
import sys
import zipfile

ATTR_NAMES = {
    0x01010001: "android:label",
    0x01010002: "android:icon",
    0x01010003: "android:name",
    0x01010010: "android:exported",
    0x0101020C: "android:minSdkVersion",
    0x01010270: "android:targetSdkVersion",
    0x01010545: "android:appCategory",
    0x010103F4: "android:isGame",
}
DATATYPE_STR = 0x03
DATATYPE_INT = 0x10
DATATYPE_HEX = 0x11
DATATYPE_BOOL = 0x12


def read_string_pool(data, off):
    _t, hsize, _size, count, _style_count, flags, strings_start, _ = struct.unpack_from("<HHIIIIII", data, off)
    utf8 = bool(flags & 0x100)
    offsets = struct.unpack_from("<%dI" % count, data, off + hsize)
    base = off + strings_start
    out = []
    for o in offsets:
        p = base + o
        if utf8:
            n = data[p]
            p += 2 if n & 0x80 else 1
            n = data[p]
            if n & 0x80:
                n = ((n & 0x7F) << 8) | data[p + 1]
                p += 2
            else:
                p += 1
            out.append(data[p:p + n].decode("utf-8", "replace"))
        else:
            n = struct.unpack_from("<H", data, p)[0]
            p += 2
            if n & 0x8000:
                n = ((n & 0x7FFF) << 16) | struct.unpack_from("<H", data, p)[0]
                p += 2
            out.append(data[p:p + n * 2].decode("utf-16-le", "replace"))
    return out


def parse(data):
    assert struct.unpack_from("<H", data, 0)[0] == 0x0003, "not an AXML document"
    off = struct.unpack_from("<H", data, 2)[0]
    total = struct.unpack_from("<I", data, 4)[0]
    strings, resmap, elements = [], [], []
    while off < total:
        ctype, hsize, csize = struct.unpack_from("<HHI", data, off)
        if csize == 0:
            break
        if ctype == 0x0001:
            strings = read_string_pool(data, off)
        elif ctype == 0x0180:
            n = (csize - hsize) // 4
            resmap = list(struct.unpack_from("<%dI" % n, data, off + hsize))
        elif ctype == 0x0102:
            # ResXMLTree_node header carries lineNumber/comment; the attribute extension
            # (ns, name, attributeStart, attributeSize, attributeCount, id/class/style) follows.
            line = struct.unpack_from("<I", data, off + 8)[0]
            _ns, name_i, attr_start, attr_size, attr_count, _id, _cls, _style = struct.unpack_from(
                "<IIHHHHHH", data, off + hsize)
            attrs = []
            aoff = off + hsize + attr_start
            for i in range(attr_count):
                base = aoff + i * attr_size
                _ans, aname, raw, _sz, _r, dtype, dval = struct.unpack_from("<IIIHBBI", data, base)
                name = ATTR_NAMES.get(resmap[aname]) if aname < len(resmap) else None
                if name is None:
                    name = "attr[0x%08X]" % resmap[aname] if aname < len(resmap) else strings[aname]
                if dtype == DATATYPE_STR:
                    val = strings[dval] if dval < len(strings) else "<bad str>"
                elif dtype == DATATYPE_INT:
                    val = dval
                elif dtype == DATATYPE_HEX:
                    val = "0x%x" % dval
                elif dtype == DATATYPE_BOOL:
                    val = "true" if dval else "false"
                else:
                    val = "(type 0x%02x) 0x%x" % (dtype, dval)
                attrs.append((name, val, resmap[aname] if aname < len(resmap) else None))
            elements.append((line, strings[name_i], attrs))
        off += csize
    return elements


def main(path):
    with zipfile.ZipFile(path) as z:
        data = z.read("AndroidManifest.xml")
    elements = parse(data)
    for line, tag, attrs in elements:
        print("E: %s (line=%d)" % (tag, line))
        for name, val, _rid in attrs:
            print("     %s = %r" % (name, val))

    def find(tag):
        return [e for e in elements if e[1] == tag]

    apps = find("application")
    assert len(apps) == 1, "expected exactly one <application>"
    app_attrs = {n: v for n, v, _ in apps[0][2]}
    assert "android:appCategory" in app_attrs, "appCategory missing"
    assert app_attrs["android:appCategory"] == 0, \
        "appCategory is %r, expected 0 == ApplicationInfo.CATEGORY_GAME" % app_attrs["android:appCategory"]
    # AOSP's own game classifier reads isGame (ApplicationInfo.FLAG_IS_GAME); appCategory alone
    # is not enough for many OEM boosters.
    assert app_attrs.get("android:isGame") == "true", \
        "isGame is %r, expected true" % app_attrs.get("android:isGame")
    meta = [a for _l, tag, attrs in elements if tag == "meta-data"
            for n, v, _ in attrs if n == "android:name" and v == "android.game_mode_config"]
    print("game_mode_config meta-data:", "present" if meta else "absent (API < 33 jar)")
    cats = []
    for _l, tag, attrs in elements:
        if tag == "category":
            for n, v, _ in attrs:
                if n == "android:name":
                    cats.append(v)
    acts = []
    for _l, tag, attrs in elements:
        if tag == "action":
            for n, v, _ in attrs:
                if n == "android:name":
                    acts.append(v)
    print()
    print("categories:", cats)
    print("actions:", acts)
    assert "android.intent.category.LAUNCHER" in cats, "LAUNCHER category missing"
    assert "android.intent.category.GAME" in cats, "GAME category missing"
    assert "android.intent.action.MAIN" in acts, "MAIN action missing"
    print()
    print("PASS: appCategory = 0 (CATEGORY_GAME), isGame = true, LAUNCHER + GAME categories, "
          "MAIN action intact")


if __name__ == "__main__":
    main(sys.argv[1])
