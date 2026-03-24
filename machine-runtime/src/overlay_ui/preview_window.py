from __future__ import annotations

import cv2


def prepare_preview_window(window_name: str, fullscreen: bool) -> None:
    cv2.namedWindow(window_name, cv2.WINDOW_NORMAL)
    if fullscreen:
        cv2.setWindowProperty(window_name, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)


def close_preview_window(window_name: str) -> None:
    try:
        cv2.destroyWindow(window_name)
    except cv2.error:
        cv2.destroyAllWindows()
