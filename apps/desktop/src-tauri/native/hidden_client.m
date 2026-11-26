// Loaded by Orbit (DYLD_INSERT_LIBRARIES) into the Wine processes of the
// Windows Steam client that signs a game in. Wine's Mac driver turns a process
// into a regular app (Dock icon, app menu, Cmd-Tab entry) the first time one of
// its windows is ordered in, and asks every other Wine app, the game included,
// to yield focus to it. Steam only has to run, never to be seen, so:
//
// - Steam's own processes (named by Wine after their Windows executable) never
//   become regular apps and never activate themselves.
// - Status items (Wine's tray icons in the menu bar) stay hidden in every
//   process that loads this library; explorer.exe hosts Steam's tray icon.
//
// The game is never started with this library, so it behaves as before.

#import <AppKit/AppKit.h>
#import <objc/runtime.h>
#include <mach-o/dyld.h>
#include <stdatomic.h>
#include <stdlib.h>
#include <strings.h>

static const char *const kHiddenExecutables[] = {
    "steam.exe",
    "steamwebhelper.exe",
    "steamservice.exe",
    "steamerrorreporter.exe",
    "steamerrorreporter64.exe",
    "steamsysinfo.exe",
    "gameoverlayui.exe",
    "gameoverlayui64.exe",
    "orbit-steam-agent.exe",
    NULL,
};

// Wine sets the program name to the Windows executable while the process
// starts, before it creates any window. O(n) over a short fixed list.
static BOOL orbit_is_hidden_process(void)
{
    const char *name = getprogname();
    if (!name) return NO;
    for (int i = 0; kHiddenExecutables[i]; i++)
    {
        if (strcasecmp(name, kHiddenExecutables[i]) == 0) return YES;
    }
    return NO;
}

static IMP orbit_replace(Class cls, SEL selector, id block)
{
    Method method = cls ? class_getInstanceMethod(cls, selector) : NULL;
    if (!method) return NULL;
    return method_setImplementation(method, imp_implementationWithBlock(block));
}

static IMP original_transform;
static IMP original_try_activate;
static IMP original_set_policy;
static IMP original_activate_ignoring;
static IMP original_activate;
static IMP original_status_item;
static atomic_bool wine_hooked;

// Wine's controller lives in winemac.so, loaded after this library, so its
// methods are replaced as soon as the class exists.
static void orbit_hook_wine_controller(void)
{
    if (atomic_load(&wine_hooked)) return;
    Class controller = objc_getClass("WineApplicationController");
    if (!controller) return;
    if (atomic_exchange(&wine_hooked, true)) return;

    original_transform = orbit_replace(controller, sel_registerName("transformProcessToForeground:"),
        ^(id self, BOOL activate) {
            if (orbit_is_hidden_process()) return;
            ((void (*)(id, SEL, BOOL))original_transform)(self, sel_registerName("transformProcessToForeground:"), activate);
        });
    original_try_activate = orbit_replace(controller, sel_registerName("tryToActivateIgnoringOtherApps:"),
        ^(id self, BOOL ignore) {
            // Activating would also ask the game to give up focus.
            if (orbit_is_hidden_process()) return;
            ((void (*)(id, SEL, BOOL))original_try_activate)(self, sel_registerName("tryToActivateIgnoringOtherApps:"), ignore);
        });
}

static void orbit_image_added(const struct mach_header *header, intptr_t slide)
{
    (void)header;
    (void)slide;
    orbit_hook_wine_controller();
}

__attribute__((constructor)) static void orbit_hidden_client_init(void)
{
    @autoreleasepool
    {
        Class application = objc_getClass("NSApplication");

        // Safety net for any other path that asks for a regular app.
        original_set_policy = orbit_replace(application, @selector(setActivationPolicy:),
            ^BOOL(id self, NSApplicationActivationPolicy policy) {
                orbit_hook_wine_controller();
                if (policy == NSApplicationActivationPolicyRegular && orbit_is_hidden_process())
                    policy = NSApplicationActivationPolicyAccessory;
                return ((BOOL (*)(id, SEL, NSApplicationActivationPolicy))original_set_policy)(
                    self, @selector(setActivationPolicy:), policy);
            });
        original_activate_ignoring = orbit_replace(application, @selector(activateIgnoringOtherApps:),
            ^(id self, BOOL ignore) {
                if (orbit_is_hidden_process()) return;
                ((void (*)(id, SEL, BOOL))original_activate_ignoring)(self, @selector(activateIgnoringOtherApps:), ignore);
            });
        original_activate = orbit_replace(application, sel_registerName("activate"),
            ^(id self) {
                if (orbit_is_hidden_process()) return;
                ((void (*)(id, SEL))original_activate)(self, sel_registerName("activate"));
            });
        original_status_item = orbit_replace(objc_getClass("NSStatusBar"), @selector(statusItemWithLength:),
            ^NSStatusItem *(id self, CGFloat length) {
                NSStatusItem *item = ((NSStatusItem * (*)(id, SEL, CGFloat))original_status_item)(
                    self, @selector(statusItemWithLength:), length);
                if ([item respondsToSelector:@selector(setVisible:)]) item.visible = NO;
                return item;
            });

        _dyld_register_func_for_add_image(orbit_image_added);
    }
}
