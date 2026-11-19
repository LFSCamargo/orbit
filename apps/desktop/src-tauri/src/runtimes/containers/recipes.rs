//! Declarative Windows dependency checks. Installers stay out of this slice.
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Recipe {
    pub id: &'static str,
    pub name: &'static str,
    pub system32: &'static [&'static str],
}

pub const RECIPES: &[Recipe] = &[
    Recipe {
        id: "vcrun2019",
        name: "Visual C++ 2015-2022",
        system32: &["vcruntime140.dll", "msvcp140.dll"],
    },
    Recipe {
        id: "d3dx9",
        name: "DirectX 9",
        system32: &["d3dx9_43.dll"],
    },
];

pub fn installed(prefix: &Path, recipe: &Recipe) -> bool {
    let system32 = prefix.join("drive_c/windows/system32");
    recipe
        .system32
        .iter()
        .all(|name| system32.join(name).is_file())
}

pub fn missing(prefix: &Path) -> Vec<&'static Recipe> {
    RECIPES
        .iter()
        .filter(|recipe| !installed(prefix, recipe))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn reports_missing_runtime_files() {
        let root = std::env::temp_dir().join(format!("orbit-recipe-{}", uuid::Uuid::new_v4()));
        let system32 = root.join("drive_c/windows/system32");
        fs::create_dir_all(&system32).unwrap();
        assert_eq!(missing(&root).len(), RECIPES.len());
        fs::write(system32.join("vcruntime140.dll"), b"dll").unwrap();
        fs::write(system32.join("msvcp140.dll"), b"dll").unwrap();
        assert!(installed(&root, &RECIPES[0]));
        assert!(!installed(&root, &RECIPES[1]));
        let _ = fs::remove_dir_all(root);
    }
}
