"""
Web Automation Script - Selenium (Chrome, visible window)

HOW TO USE:
1. Install dependencies: pip install -r requirements.txt
2. Fill in the configuration section below (search for TODO comments)
3. Run: python web_automation.py
4. Downloaded files will be saved in the 'downloads/' folder
"""

import os
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

# ---------------------------------------------------------------------------
# CONFIGURATION — edit these values to match your target site
# ---------------------------------------------------------------------------

LOGIN_URL = "https://www.gestaodevaletransporte.com.br/crm/main.jsp"

USERNAME = "your_username"               # TODO: replace with your username / e-mail
PASSWORD = "your_password"               # TODO: replace with your password

# CSS selectors or XPaths for the login form fields and submit button
USERNAME_SELECTOR = "#username"          # TODO: CSS selector for the username input
PASSWORD_SELECTOR = "#password"          # TODO: CSS selector for the password input
LOGIN_BUTTON_SELECTOR = "#btentrar"

# Sequence of buttons to click AFTER login (in order).
# Each entry is a CSS selector for the button/link to click.
BUTTONS_TO_CLICK = [
    "#lnk37",   # Relatório de PIV
]

# CSS selector for the download link or button
DOWNLOAD_SELECTOR = "#download-file"    # TODO: replace with the download element selector

# How long (seconds) to wait for elements to appear before giving up
WAIT_TIMEOUT = 15

# Path to chromedriver.exe — download from https://googlechromelabs.github.io/chrome-for-testing/
# Must match your Chrome version (check at chrome://version/). Example: "C:\\chromedriver\\chromedriver.exe"
CHROMEDRIVER_PATH = r"C:\chromedriver\chromedriver.exe"  # TODO: set your actual path

# Folder where downloaded files will be saved (created automatically)
DOWNLOAD_DIR = str(Path(__file__).parent / "downloads")

# ---------------------------------------------------------------------------
# BROWSER SETUP
# ---------------------------------------------------------------------------

def create_driver() -> webdriver.Chrome:
    """Create and return a Chrome WebDriver with download preferences configured."""
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)

    prefs = {
        "download.default_directory": DOWNLOAD_DIR,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True,
    }

    options = Options()
    options.add_experimental_option("prefs", prefs)
    # Visible window — remove or comment out the line below to run headless:
    # options.add_argument("--headless=new")

    service = Service(CHROMEDRIVER_PATH) if CHROMEDRIVER_PATH else None
    driver = webdriver.Chrome(service=service, options=options)
    driver.maximize_window()
    return driver

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def wait_and_click(driver: webdriver.Chrome, selector: str, timeout: int = WAIT_TIMEOUT) -> None:
    """Wait until an element is clickable, then click it."""
    element = WebDriverWait(driver, timeout).until(
        EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
    )
    element.click()


def wait_and_type(driver: webdriver.Chrome, selector: str, text: str, timeout: int = WAIT_TIMEOUT) -> None:
    """Wait until an input is visible, clear it, then type the given text."""
    element = WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((By.CSS_SELECTOR, selector))
    )
    element.clear()
    element.send_keys(text)


def wait_for_download(directory: str, timeout: int = 60) -> bool:
    """
    Block until all active Chrome downloads (.crdownload) in `directory` finish.
    Returns True if downloads completed within the timeout, False otherwise.
    """
    deadline = time.time() + timeout
    while time.time() < deadline:
        crdownloads = list(Path(directory).glob("*.crdownload"))
        if not crdownloads:
            # No in-progress downloads — check that at least one file exists
            files = [f for f in Path(directory).iterdir() if f.is_file()]
            if files:
                return True
        time.sleep(1)
    return False

# ---------------------------------------------------------------------------
# MAIN STEPS
# ---------------------------------------------------------------------------

def do_login(driver: webdriver.Chrome) -> None:
    """Navigate to the login page and submit credentials."""
    print(f"[1/4] Navigating to {LOGIN_URL} ...")
    driver.get(LOGIN_URL)

    print("[1/4] Filling in login form ...")
    wait_and_type(driver, USERNAME_SELECTOR, USERNAME)
    wait_and_type(driver, PASSWORD_SELECTOR, PASSWORD)
    wait_and_click(driver, LOGIN_BUTTON_SELECTOR)

    # O site abre o menu em nova janela via window.open('menu.jsp','pm')
    # Aguarda a nova janela aparecer e troca o foco para ela
    print("[1/4] Waiting for menu window to open ...")
    WebDriverWait(driver, WAIT_TIMEOUT).until(lambda d: len(d.window_handles) > 1)
    driver.switch_to.window(driver.window_handles[-1])
    print("[1/4] Login complete, switched to menu window.")


def click_buttons(driver: webdriver.Chrome) -> None:
    """Click each button in BUTTONS_TO_CLICK in sequence."""
    for i, selector in enumerate(BUTTONS_TO_CLICK, start=1):
        print(f"[2/4] Clicking button {i}/{len(BUTTONS_TO_CLICK)}: {selector}")
        wait_and_click(driver, selector)


def download_file(driver: webdriver.Chrome) -> None:
    """Click the download element and wait for the file to finish downloading."""
    print(f"[3/4] Clicking download element: {DOWNLOAD_SELECTOR}")
    wait_and_click(driver, DOWNLOAD_SELECTOR)

    print(f"[3/4] Waiting for download to complete in: {DOWNLOAD_DIR}")
    success = wait_for_download(DOWNLOAD_DIR)
    if success:
        files = sorted(Path(DOWNLOAD_DIR).iterdir(), key=lambda f: f.stat().st_mtime, reverse=True)
        print(f"[3/4] Download complete! Latest file: {files[0].name}")
    else:
        print("[3/4] WARNING: Download may not have finished within the timeout.")


def main() -> None:
    driver = create_driver()
    try:
        do_login(driver)
        click_buttons(driver)
        download_file(driver)
        print("[4/4] All done!")
    except Exception as exc:
        print(f"[ERROR] {exc}")
        raise
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
