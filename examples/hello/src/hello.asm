; hello.asm -- CP/M サンプル (1文字出力)

        ORG 0x0100        ; CP/M 実行プログラム開始番地

        LD  E,'#'         ; 出力する文字
        LD  C,2           ; BDOS function 2 (C = function, E = char)
        CALL BDOS         ; BDOS呼び出し (0x0005)
        JR  $             ; 無限ループで停止

        END
