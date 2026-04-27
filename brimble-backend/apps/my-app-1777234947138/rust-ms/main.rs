use actix_web::{get, App, HttpServer, Responder};

#[get("/")]
async fn index() -> impl Responder {
    "Hello from Rust 🚀"
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let port = std::env::var("PORT").unwrap_or("3000".into());

    HttpServer::new(|| {
        App::new()
            .service(index)
    })
    .bind(format!("0.0.0.0:{}", port))?
    .run()
    .await
}