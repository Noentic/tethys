//! `terminal.*` namespace (`architecture.md` §12.1).

use crate::ApiError;

/// Terminal list, attach, write and resize methods.
pub trait TerminalApi: Send + Sync {
    fn terminal_list(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("terminal.list")) }
    }

    fn terminal_attach(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("terminal.attach")) }
    }

    fn terminal_write(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("terminal.write")) }
    }

    fn terminal_resize(&self) -> impl std::future::Future<Output = Result<(), ApiError>> + Send {
        async { Err(ApiError::Unimplemented("terminal.resize")) }
    }
}
