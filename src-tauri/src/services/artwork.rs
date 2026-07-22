/// Future SteamGridDB integration will live here (user-provided API key only).
/// MVP: local provider artwork + title placeholders + custom images.
pub struct ArtworkService;

impl ArtworkService {
    pub fn placeholder_note() -> &'static str {
        "Artwork scraping is out of scope. Use local provider art or custom images."
    }
}
