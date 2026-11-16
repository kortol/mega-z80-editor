; CP/M runtime for SCC programs that link against the translated libc archive.
; This variant intentionally exposes only the low-level stdio primitives so
; libc members such as putchar/getchar/puts/fputs can override the higher layer.
	.module	cpmlibc
	.globl	main
	.globl	exit
	.globl	fputc
	.globl	fgetc
	.globl	.gchar
	.globl	.gint
	.globl	.pchar
	.globl	.pint
	.area	_CODE
START:
	call	main
	call	exit
	ret
;
; int fgetc(FILE *fp) -- only stdin(0) is supported
fgetc:
	ld	hl,#2
	add	hl,sp
	call	.gint
	ld	a,h
	or	l
	jr	z,.fgetc0
	ld	hl,#-1
	ret
.fgetc0:
	ld	c,#1
	call	5
	ld	l,a
	ld	h,#0
	ret
;
; int fputc(int ch, FILE *fp) -- stdout/stderr are treated identically
fputc:
	ld	hl,#4
	add	hl,sp
	call	.gchar
	ld	e,l
	ld	c,#2
	call	5
	ld	l,e
	ld	h,#0
	ret
;
; void exit(void)
exit:
	ld	c,#0
	call	5
	ret
;
; fetch char from (HL)
.gchar:	ld	l,(hl)
	ld	h,#0
	ret
;
; fetch int from (HL)
.gint:	ld	a,(hl)
	inc	hl
	ld	h,(hl)
	ld	l,a
	ret
;
; store char L into (DE)
.pchar:	ld	a,l
	ld	(de),a
	ret
;
; store int HL into (DE)
.pint:	ld	a,l
	ld	(de),a
	inc	de
	ld	a,h
	ld	(de),a
	ret
