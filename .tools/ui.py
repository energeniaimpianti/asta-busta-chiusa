"""Helper UI automation: trova un nodo per testo (esatto o contenuto) e lo tocca."""
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

ADB = r"V:\Progetti GLM\App Fantacalcio\.tools\android-sdk\platform-tools\adb.exe"


def sh(*args):
    r = subprocess.run([ADB] + list(args), capture_output=True, text=True, timeout=90)
    return (r.stdout or "") + (r.stderr or "")


def dump_xml():
    sh("shell", "uiautomator", "dump")
    return sh("shell", "cat /sdcard/window_dump.xml")


def trova(txt, contiene=False):
    root = ET.fromstring(dump_xml())
    for node in root.iter("node"):
        t = node.get("text", "") or ""
        if (txt in t) if contiene else (t == txt):
            m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.get("bounds", ""))
            if not m:
                continue
            cx = (int(m.group(1)) + int(m.group(3))) // 2
            cy = (int(m.group(2)) + int(m.group(4))) // 2
            return cx, cy
    return None


def tap(txt, contiene=False, attesa=1.2):
    pos = trova(txt, contiene)
    if not pos:
        print("NOT_FOUND:", txt)
        return False
    sh("shell", "input", "tap", str(pos[0]), str(pos[1]))
    time.sleep(attesa)
    print("TAP_OK:", txt, pos)
    return True


def scorri(giù=True, attesa=0.8):
    if giù:
        sh("shell", "input", "swipe", "540", "1500", "540", "400", "300")
    else:
        sh("shell", "input", "swipe", "540", "400", "540", "1500", "300")
    time.sleep(attesa)


def tap_o_scorri(txt, contiene=False, tentativi=5):
    """Tenta il tap, scorrendo la schermata se il testo non è visibile."""
    for i in range(tentativi):
        pos = trova(txt, contiene)
        if pos:
            sh("shell", "input", "tap", str(pos[0]), str(pos[1]))
            time.sleep(1.2)
            print("TAP_OK:", txt, pos)
            return True
        scorri()
    print("NOT_FOUND:", txt)
    return False


if __name__ == "__main__":
    # uso: ui.py tap "testo" [c] | ui.py scroll
    if sys.argv[1] == "scroll":
        scorri()
        sys.exit(0)
    contiene = len(sys.argv) > 3 and sys.argv[3] == "c"
    sys.exit(0 if tap_o_scorri(sys.argv[2], contiene) else 1)
