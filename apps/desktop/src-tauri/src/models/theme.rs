use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeColors {
    pub canvas: String,
    pub surface: String,
    pub panel: String,
    pub foreground: String,
    pub muted: String,
    pub accent: String,
    pub focus: String,
    pub border: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeBranding {
    pub logo_text: Option<String>,
    pub logo_style: Option<String>,
    pub logo_image: Option<String>,
    pub wallpaper: Option<String>,
    pub tagline: Option<String>,
    pub artwork_query: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeFonts {
    pub display: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeMotion {
    pub duration: Option<String>,
    pub easing: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeDefinition {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub kind: Option<String>,
    pub fonts: Option<ThemeFonts>,
    pub colors: ThemeColors,
    pub radius: Option<String>,
    pub card_radius: Option<String>,
    pub blur: Option<String>,
    pub motion: Option<ThemeMotion>,
    pub branding: Option<ThemeBranding>,
}
