//! Bounded text KeyValues used only for the managed client's library folders.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    Text(String),
    Object(Vec<(String, Value)>),
}

pub fn parse(input: &str) -> Result<Vec<(String, Value)>, String> {
    if input.len() > 262144 {
        return Err("Steam library configuration is too large".into());
    }
    let mut tokens = Vec::new();
    let mut chars = input.chars().peekable();
    while let Some(c) = chars.next() {
        let token = match c {
            c if c.is_whitespace() => continue,
            '/' if chars.peek() == Some(&'/') => {
                for c in chars.by_ref() {
                    if c == '\n' {
                        break;
                    }
                }
                continue;
            }
            '{' | '}' => (c, String::new()),
            '"' => {
                let mut text = String::new();
                loop {
                    match chars.next() {
                        Some('"') => break,
                        Some('\\') => match chars.next() {
                            Some(c @ ('\\' | '"')) => text.push(c),
                            _ => return Err("Invalid Steam library escape".into()),
                        },
                        Some(c) if !c.is_control() => text.push(c),
                        _ => return Err("Invalid Steam library string".into()),
                    }
                }
                ('s', text)
            }
            _ => return Err("Invalid Steam library configuration".into()),
        };
        tokens.push(token);
        if tokens.len() > 16384 {
            return Err("Too many Steam library fields".into());
        }
    }
    fn object(
        tokens: &[(char, String)],
        at: &mut usize,
        depth: usize,
    ) -> Result<Vec<(String, Value)>, String> {
        if depth > 8 {
            return Err("Steam library configuration is too deeply nested".into());
        }
        let mut fields = Vec::new();
        while *at < tokens.len() {
            if tokens[*at].0 == '}' {
                if depth == 0 {
                    return Err("Unexpected Steam library closing brace".into());
                }
                *at += 1;
                return Ok(fields);
            }
            let (kind, key) = &tokens[*at];
            if *kind != 's' {
                return Err("Missing Steam library field name".into());
            }
            *at += 1;
            let value = match tokens.get(*at) {
                Some(('s', value)) => {
                    *at += 1;
                    Value::Text(value.clone())
                }
                Some(('{', _)) => {
                    *at += 1;
                    Value::Object(object(tokens, at, depth + 1)?)
                }
                _ => return Err("Missing Steam library field value".into()),
            };
            fields.push((key.clone(), value));
        }
        if depth > 0 {
            return Err("Unclosed Steam library configuration".into());
        }
        Ok(fields)
    }
    object(&tokens, &mut 0, 0)
}

pub fn write(fields: &[(String, Value)]) -> String {
    fn quoted(value: &str) -> String {
        format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
    }
    let mut output = String::new();
    for (key, value) in fields {
        output.push_str(&quoted(key));
        match value {
            Value::Text(text) => {
                output.push(' ');
                output.push_str(&quoted(text));
                output.push('\n');
            }
            Value::Object(fields) => {
                output.push_str("\n{\n");
                output.push_str(&write(fields));
                output.push_str("}\n");
            }
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrips_escaped_paths_and_keeps_unknown_fields() {
        let input = r#""libraryfolders" { "0" { "path" "C:\\Steam" "unknown" "keep" } }"#;
        let parsed = parse(input).unwrap();
        assert_eq!(parse(&write(&parsed)), Ok(parsed));
        for bad in [r#""a" { "b" "c""#, r#""a" "bad\q""#, r#""a" }"#] {
            assert!(parse(bad).is_err());
        }
        assert!(parse(&"x".repeat(262145)).is_err());
    }
}
