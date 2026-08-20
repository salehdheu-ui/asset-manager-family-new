# School prototype visual QA

The local Vite route `/school` rendered successfully in headless Chromium at 1440×1050. The Arabic RTL layout is visually coherent: the sidebar is on the right, the header hierarchy is legible, the green hero card, metric cards, attendance chart, upcoming classes, and alert panel align cleanly, and the responsive dashboard uses a clear card system with strong contrast.

One integration issue was found: the existing family-platform `InstallPrompt` still renders over the school route in the lower-left corner, showing family-fund copy. The next fix should hide `InstallPrompt` and `PushInvite` while the current route starts with `/school`. The page itself had no visible runtime error in the rendered DOM; the only Chromium log entry was a benign missing UPower D-Bus service.


## Final verification

After hiding the family-product prompts on `/school`, the second 1440×1050 screenshot shows the school dashboard cleanly with no unrelated overlay. The RTL sidebar, hero panel, metric cards, attendance chart, schedule card, and lower content sections remain aligned and readable. Chromium still reports only the environment-level UPower D-Bus warning; no application runtime error was observed.


## Mobile breakpoint

At 390×844, the desktop sidebar collapses behind a menu button, the hero card stacks above the attention panel, and metric cards become a two-column grid with readable Arabic text and adequate touch targets. No clipping or horizontal overflow was visible in the captured viewport.
